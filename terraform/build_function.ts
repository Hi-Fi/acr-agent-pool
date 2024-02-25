import { join } from 'path';
import { buildSync } from 'esbuild';
import { copyFileSync, rmSync, writeFileSync } from 'fs';


export function bundleFunction() {
  rmSync('dist', {
    recursive: true,
    force: true
  });
  buildSync({
    entryPoints: [join(process.cwd(), '../autoscaling-function/src/functions/AcrAgentPoolAutoScaler.ts')],
    minify: false,
    bundle: true,
    platform: 'node',
    target: 'node18',
    sourcemap: false,
    //https://github.com/Azure/azure-functions-nodejs-library/issues/201
    external: [
      '@azure/functions-core'
    ],
    outfile: join(process.cwd(), 'dist/index.js'),
    absWorkingDir: join(process.cwd(), '../autoscaling-function')
  });

  const bundledPackage = {
    main: 'index.js'
  }

  writeFileSync('dist/package.json', JSON.stringify(bundledPackage));
  copyFileSync(join(process.cwd(), '../autoscaling-function/host.json'), 'dist/host.json');

  return join(process.cwd(), 'dist')
}