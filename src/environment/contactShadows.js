import * as THREE from 'three';

/**
 * Contact shadows (Phase 8) — a soft dark blob under every character.
 *
 * The directional key already casts real shadows, but those live in a
 * camera-following frustum that refreshes only 4-6 times a second, so a
 * character's *feet* never had the tight, always-present darkening that tells
 * a viewer "this figure is standing on that ground". A radial alpha decal is
 * the standard trick for it.
 *
 * Every blob is one instance of a single shared quad + one shared texture, so
 * the entire cast's contact shadowing costs exactly ONE draw call and one
 * texture regardless of how many people are on screen.
 */
export function createContactShadows(scene, { count = 72 } = {}) {
  // ---- shared radial falloff texture ------------------------------------
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;

  // ---- one shared flat quad, instanced ----------------------------------
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2); // lie flat on the ground

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0x05070c,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: true,
  });

  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false; // instances are scattered across the whole world
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.renderOrder = 2; // after opaque geometry, before HUD-ish overlays
  scene.add(mesh);

  const dummy = new THREE.Object3D();

  /**
   * @param {Array<{x:number,y?:number,z:number,r:number}>} entries
   *   y is the ground height under the character; r the blob radius in metres.
   */
  function update(entries) {
    const n = Math.min(entries.length, count);
    for (let i = 0; i < n; i++) {
      const e = entries[i];
      // 2 cm above the ground plane: far enough to win the depth test against
      // the road, close enough to read as contact rather than a floating decal
      dummy.position.set(e.x, (e.y ?? 0) + 0.02, e.z);
      dummy.scale.set(e.r, 1, e.r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  function setEnabled(on) {
    mesh.visible = !!on;
  }

  return {
    mesh,
    update,
    setEnabled,
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
