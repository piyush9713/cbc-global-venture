/**
 * Vercel Serverless Function: POST /api/publish
 * Commits updated SITE_DATA directly to the GitHub repository (piyush9713/cbc-global-venture),
 * which triggers Vercel to automatically rebuild and deploy the site worldwide in ~30 seconds.
 */

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Github-Token, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is supported.' });
  }

  try {
    const { secretCode, siteData, customToken, commitMessage, owner, repo, branch } = req.body || {};

    // 1. Passcode verification
    const validCodes = ['cbc2026', 'admin', 'cbc@admin'];
    if (process.env.STUDIO_SECRET_CODE) {
      validCodes.push(process.env.STUDIO_SECRET_CODE.trim());
    }
    const customCode = siteData?.company?.studioCode?.trim();
    if (customCode) {
      validCodes.push(customCode);
    }

    const isCodeValid = secretCode && validCodes.some(c => c.toLowerCase() === secretCode.trim().toLowerCase());
    if (!isCodeValid) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid Content Studio passcode.',
      });
    }

    if (!siteData || !siteData.company || !siteData.products) {
      return res.status(400).json({
        error: 'Invalid payload: missing required siteData fields (company, products).',
      });
    }

    // 2. Token resolution
    const githubToken =
      process.env.GITHUB_TOKEN ||
      req.headers['x-github-token'] ||
      (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null) ||
      customToken;

    if (!githubToken) {
      return res.status(400).json({
        error:
          'GitHub Token missing. Either add GITHUB_TOKEN to your Vercel Project Environment Variables, or enter a Personal Access Token in Content Studio.',
        code: 'TOKEN_REQUIRED'
      });
    }

    const repoOwner = owner || process.env.GITHUB_OWNER || 'piyush9713';
    const repoName = repo || process.env.GITHUB_REPO || 'cbc-global-venture';
    const targetBranch = branch || process.env.GITHUB_BRANCH || 'main';
    const targetFilePath = 'index.html';

    const ghHeaders = {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${githubToken.trim()}`,
      'User-Agent': 'CBC-Global-Venture-Content-Studio',
    };

    // 3. Fetch current index.html from GitHub to get current SHA & content
    const fileApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${targetFilePath}?ref=${targetBranch}`;
    const getRes = await fetch(fileApiUrl, { headers: ghHeaders });

    if (!getRes.ok) {
      const errBody = await getRes.json().catch(() => ({}));
      return res.status(getRes.status).json({
        error: `Failed to fetch file from GitHub (${getRes.status}): ${errBody.message || getRes.statusText}`,
        details: errBody
      });
    }

    const fileData = await getRes.json();
    const currentSha = fileData.sha;
    const rawContent = Buffer.from(fileData.content, 'base64').toString('utf8');

    // 4. Locate and replace DEFAULT_DATA in index.html
    const marker = 'const DEFAULT_DATA = ';
    const start = rawContent.indexOf(marker);
    if (start === -1) {
      return res.status(500).json({
        error: 'Could not locate "const DEFAULT_DATA = " block inside remote index.html.'
      });
    }

    let depth = 0;
    let i = start + marker.length;
    let end = -1;

    while (i < rawContent.length) {
      if (rawContent[i] === '{') {
        depth++;
      } else if (rawContent[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
      i++;
    }

    if (end !== -1 && rawContent[end] === ';') {
      end++;
    }

    if (end === -1) {
      return res.status(500).json({
        error: 'Could not find the closing brace of DEFAULT_DATA object block.'
      });
    }

    const newBlock = `const DEFAULT_DATA = ${JSON.stringify(siteData, null, 2)};`;
    const updatedHtml = rawContent.slice(0, start) + newBlock + rawContent.slice(end);

    // 5. Commit updated file to GitHub via PUT /contents
    const base64Updated = Buffer.from(updatedHtml, 'utf8').toString('base64');
    const commitMsg =
      commitMessage ||
      `chore(content): update website content via Content Studio [${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC]`;

    const putRes = await fetch(fileApiUrl, {
      method: 'PUT',
      headers: {
        ...ghHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: commitMsg,
        content: base64Updated,
        sha: currentSha,
        branch: targetBranch,
      }),
    });

    if (!putRes.ok) {
      const putErr = await putRes.json().catch(() => ({}));
      return res.status(putRes.status).json({
        error: `Failed to commit to GitHub (${putRes.status}): ${putErr.message || putRes.statusText}`,
        details: putErr
      });
    }

    const putData = await putRes.json();

    return res.status(200).json({
      success: true,
      message: 'Successfully committed to GitHub. Vercel deployment triggered.',
      commitUrl: putData.commit?.html_url || `https://github.com/${repoOwner}/${repoName}/commits/${targetBranch}`,
      commitSha: putData.commit?.sha || null,
      repo: `${repoOwner}/${repoName}`,
      branch: targetBranch,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Publish API error:', err);
    return res.status(500).json({
      error: 'Internal Server Error: ' + (err.message || 'Unknown error'),
    });
  }
};
