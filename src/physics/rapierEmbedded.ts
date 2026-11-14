/**
 * The physics engine for the stand-alone build (one HTML file that is opened
 * by double-clicking it). Browsers do not let a page opened from disk fetch a
 * separate WebAssembly file, so this build uses the edition of the engine
 * that carries its WebAssembly inside the JavaScript, and starts it here.
 * The normal build never loads this file: vite.standalone.config.ts points the
 * engine's import at it.
 */
import * as R from '@dimforge/rapier3d-compat';

await R.init();

export * from '@dimforge/rapier3d-compat';
