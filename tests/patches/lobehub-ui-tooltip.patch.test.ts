import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

const read = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

const uiPatches = [
  ['@lobehub/ui@5.10.0', 'patches/@lobehub__ui@5.10.0.patch'],
  ['@lobehub/ui@5.10.2', 'patches/@lobehub__ui@5.10.2.patch'],
] as const;

const resolveInstalledTooltip = (version: string) => {
  const pnpmDir = join(repoRoot, 'node_modules/.pnpm');
  const packageDir = readdirSync(pnpmDir).find((name) =>
    name.startsWith(`@lobehub+ui@${version}_`),
  );

  expect(packageDir).toBeTruthy();

  return join(pnpmDir, packageDir!, 'node_modules/@lobehub/ui/es/Tooltip/TooltipStandalone.mjs');
};

describe('@lobehub/ui TooltipStandalone patch', () => {
  it('registers both installed @lobehub/ui versions as patched dependencies', () => {
    const packageJson = JSON.parse(read('package.json'));
    const workspaceYaml = read('pnpm-workspace.yaml');

    for (const [dependency, patchPath] of uiPatches) {
      expect(packageJson.pnpm.patchedDependencies[dependency]).toBe(patchPath);
      expect(workspaceYaml).toContain(`'${dependency}': ${patchPath}`);
    }
  });

  it('guards the tooltip trigger callback ref against repeated same-node updates', () => {
    for (const [, patchPath] of uiPatches) {
      const patchContent = read(patchPath);

      expect(patchContent).toContain('useRef, useState');
      expect(patchContent).toContain('if (!getPopupContainer) return');
      expect(patchContent).toContain('triggerNodeRef.current !== node');
      expect(patchContent).toContain('setTriggerNode(node)');
    }
  });

  it('applies the same-node guard to locally installed @lobehub/ui builds', () => {
    for (const [dependency] of uiPatches) {
      const version = dependency.split('@').at(-1)!;
      const installedTooltip = readFileSync(resolveInstalledTooltip(version), 'utf8');

      expect(installedTooltip).toContain('useRef, useState');
      expect(installedTooltip).toContain('if (!getPopupContainer) return');
      expect(installedTooltip).toContain('triggerNodeRef.current !== node');
      expect(installedTooltip).toContain('setTriggerNode(node)');
    }
  });
});
