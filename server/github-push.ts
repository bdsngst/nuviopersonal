import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.cache',
  '.replit',
  'replit.nix',
  '.config',
  '.upm',
  'generated-icon.png',
  'package-lock.json',
  '.breakpoints',
  'dist',
  '.DS_Store',
  'attached_assets'
];

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (shouldIgnore(fullPath)) return;
    
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

async function pushToGitHub(owner: string, repo: string) {
  console.log(`Pushing to ${owner}/${repo}...`);
  
  const octokit = await getUncachableGitHubClient();
  
  let repoExists = false;
  try {
    await octokit.repos.get({ owner, repo });
    repoExists = true;
    console.log('Repository exists, will update files...');
  } catch (e: any) {
    if (e.status === 404) {
      console.log('Creating new repository...');
      await octokit.repos.createForAuthenticatedUser({
        name: repo,
        description: 'Nuvio Stremio Addon - Multi-provider streaming aggregator',
        private: false,
        auto_init: true
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      throw e;
    }
  }

  const files = getAllFiles('.');
  console.log(`Found ${files.length} files to push`);

  let mainSha: string | undefined;
  try {
    const { data: ref } = await octokit.git.getRef({
      owner,
      repo,
      ref: 'heads/main'
    });
    mainSha = ref.object.sha;
  } catch (e) {
    console.log('No existing main branch, will create initial commit');
  }

  const blobs = await Promise.all(
    files.map(async (filePath) => {
      const content = fs.readFileSync(filePath);
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: content.toString('base64'),
        encoding: 'base64'
      });
      return {
        path: filePath.startsWith('./') ? filePath.slice(2) : filePath,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blob.sha
      };
    })
  );

  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    tree: blobs,
    base_tree: mainSha
  });

  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo,
    message: 'Update Nuvio Stremio Addon',
    tree: tree.sha,
    parents: mainSha ? [mainSha] : []
  });

  await octokit.git.updateRef({
    owner,
    repo,
    ref: 'heads/main',
    sha: commit.sha
  });

  console.log(`Successfully pushed to https://github.com/${owner}/${repo}`);
  return `https://github.com/${owner}/${repo}`;
}

const [owner, repo] = process.argv[2]?.split('/') || [];
if (!owner || !repo) {
  console.error('Usage: npx tsx server/github-push.ts owner/repo');
  process.exit(1);
}

pushToGitHub(owner, repo)
  .then(url => console.log(`Done! Repository: ${url}`))
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
