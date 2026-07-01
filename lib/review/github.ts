import type { Octokit } from "octokit";

import { getBot } from "@/lib/bot";
import { parseError } from "@/lib/error";
import { getAppInfo, getInstallationOctokit } from "@/lib/github";

export interface PushAccessResult {
  canPush: boolean;
  reason?: string;
}

export const addPRComment = async (
  threadId: string,
  body: string
): Promise<void> => {
  const bot = await getBot();
  const adapter = bot.getAdapter("github");
  await adapter.postMessage(threadId, { markdown: body });
};

export const startTyping = async (
  threadId: string,
  text: string
): Promise<void> => {
  const bot = await getBot();
  const adapter = bot.getAdapter("github");
  await adapter.startTyping(threadId, text);
};

const checkRepoArchived = async (
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<PushAccessResult | null> => {
  const { data } = await octokit.rest.repos.get({ owner, repo });

  if (data.archived) {
    return {
      canPush: false,
      reason: "Repository is archived and cannot be modified",
    };
  }

  return null;
};

const checkInstallationPermissions = async (
  octokit: Octokit,
  installationId: number
): Promise<PushAccessResult | null> => {
  const { data } = await octokit.rest.apps.getInstallation({
    installation_id: installationId,
  });

  const { permissions } = data;

  if (!permissions?.contents || permissions.contents === "read") {
    return {
      canPush: false,
      reason: "Installation does not have write access to repository contents",
    };
  }

  return null;
};

const getErrorStatus = (error: unknown): number => {
  if (error instanceof Error && "status" in error) {
    return (error as { status: number }).status;
  }
  return 0;
};

const checkBranchRestrictions = (
  restrictions: { apps?: { slug?: string }[] } | null | undefined,
  branch: string,
  appSlug: string
): PushAccessResult | null => {
  if (!restrictions) {
    return null;
  }

  const allowedApps = restrictions.apps ?? [];
  const isAppAllowed = allowedApps.some((app) => app.slug === appSlug);

  if (!isAppAllowed && allowedApps.length > 0) {
    return {
      canPush: false,
      reason: `Branch "${branch}" has push restrictions that don't include the ${appSlug} app`,
    };
  }

  return null;
};

const checkBranchProtection = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  appSlug: string
): Promise<PushAccessResult | null> => {
  try {
    const { data } = await octokit.rest.repos.getBranchProtection({
      branch,
      owner,
      repo,
    });

    return checkBranchRestrictions(data.restrictions, branch, appSlug);
  } catch (error) {
    const status = getErrorStatus(error);
    if (status === 404 || status === 403) {
      return null;
    }
    throw error;
  }
};

const runAccessChecks = async (
  octokit: Octokit,
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
  appSlug: string
): Promise<PushAccessResult> => {
  const archived = await checkRepoArchived(octokit, owner, repo);
  if (archived) {
    return archived;
  }

  const permissions = await checkInstallationPermissions(
    octokit,
    installationId
  );
  if (permissions) {
    return permissions;
  }

  const protection = await checkBranchProtection(
    octokit,
    owner,
    repo,
    branch,
    appSlug
  );
  if (protection) {
    return protection;
  }

  return { canPush: true };
};

export const checkPushAccess = async (
  installationId: number,
  repoFullName: string,
  branch: string
): Promise<PushAccessResult> => {
  const [owner, repo] = repoFullName.split("/");

  if (!owner || !repo) {
    throw new Error(`Invalid repository name: ${repoFullName}`);
  }

  const octokit = await getInstallationOctokit(installationId).catch(
    (error: unknown) => {
      throw new Error(
        `[checkPushAccess] Failed to get GitHub client: ${parseError(error)}`
      );
    }
  );

  const appInfo = await getAppInfo().catch((error: unknown) => {
    throw new Error(
      `[checkPushAccess] Failed to get GitHub app info: ${parseError(error)}`
    );
  });

  return runAccessChecks(
    octokit,
    installationId,
    owner,
    repo,
    branch,
    appInfo.slug
  );
};

export const getGitHubToken = async (
  installationId: number
): Promise<string> => {
  const octokit = await getInstallationOctokit(installationId).catch(
    (error: unknown) => {
      throw new Error(
        `[getGitHubToken] Failed to get GitHub client: ${parseError(error)}`
      );
    }
  );

  const auth = await (
    octokit.auth({ type: "installation" }) as Promise<{ token: string }>
  ).catch((error: unknown) => {
    throw new Error(`Failed to get GitHub token: ${parseError(error)}`);
  });

  return auth.token;
};
