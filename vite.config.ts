import { execFileSync } from "node:child_process";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

type DeploymentEnvironment = "qa" | "prod";

const qaKcaTarget = "https://qa-kca-proxy.juisemobility.com";
const productionKcaTarget = "https://kca-proxy.juisemobility.com";
const productionBranches = new Set(["main", "prod", "production"]);

function normalizeBranch(value: string | undefined): string {
  return (value?.trim().toLowerCase() ?? "")
    .replace(/^refs\/heads\//, "")
    .replace(/^origin\//, "");
}

function readLocalGitBranch(): string {
  try {
    return normalizeBranch(
      execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return "";
  }
}

function resolveGitBranch(env: Record<string, string | undefined>): string {
  const configuredBranch = [
    env.VITE_GIT_BRANCH,
    env.GITHUB_HEAD_REF,
    env.GITHUB_REF_NAME,
    env.REPLIT_GIT_BRANCH,
    env.BRANCH_NAME,
    env.GIT_BRANCH,
  ]
    .map(normalizeBranch)
    .find(Boolean);

  return configuredBranch || readLocalGitBranch();
}

function resolveDeploymentEnvironment(
  env: Record<string, string | undefined>,
  branch: string,
): DeploymentEnvironment {
  const configuredEnvironment = env.VITE_DEPLOYMENT_ENV
    ?.trim()
    .toLowerCase();
  if (
    configuredEnvironment === "prod" ||
    configuredEnvironment === "production"
  ) {
    return "prod";
  }
  if (configuredEnvironment === "qa") {
    return "qa";
  }

  // Unknown and feature branches use QA so an unrecognized branch cannot
  // accidentally send dashboard traffic to production.
  return productionBranches.has(branch) ? "prod" : "qa";
}

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, process.cwd(), ""),
    ...process.env,
  };
  const envTarget = (key: string, fallback: string) =>
    env[key]?.trim() || fallback;
  const gitBranch = resolveGitBranch(env);
  const deploymentEnvironment = resolveDeploymentEnvironment(env, gitBranch);
  const defaultKcaTarget =
    deploymentEnvironment === "prod" ? productionKcaTarget : qaKcaTarget;
  const kcaTarget = envTarget("VITE_KCA_PROXY_TARGET", defaultKcaTarget);

  const proxyConfig = {
    "/kca-api": {
      target: kcaTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/kca-api/, ""),
    },
  };

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_DEPLOYMENT_ENV": JSON.stringify(
        deploymentEnvironment,
      ),
      "import.meta.env.VITE_GIT_BRANCH": JSON.stringify(gitBranch),
    },
    server: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
      proxy: proxyConfig,
    },
    preview: {
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
      proxy: proxyConfig,
    },
  };
});
