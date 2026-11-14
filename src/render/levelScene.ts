import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import type { LevelDef } from '../level/types';
import type { Path } from '../trucks/path';
import { PALETTE, SCENE_DIMS as D } from './palette';

const UP = new Vector3(0, 1, 0);

/** Static visuals for a level: ground, road ribbons with lane dashes, posts, scenery. */
export class LevelScene {
  readonly scene = new Scene();
  private readonly ground: Mesh;

  constructor(level: LevelDef, paths: Iterable<Path>) {
    const s = this.scene;
    s.background = new Color(PALETTE.sky);
    s.fog = new Fog(PALETTE.fog, PALETTE.fogNear, PALETTE.fogFar);
    s.add(new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.6));
    const sun = new DirectionalLight(PALETTE.sun, 2.2);
    sun.position.set(-0.5, 1, -0.35);
    s.add(sun);

    this.ground = new Mesh(
      new PlaneGeometry(D.groundSize, D.groundSize),
      new MeshLambertMaterial({ color: PALETTE.ground }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    s.add(this.ground);

    for (const path of paths) this.addRoad(path);

    const blockMat = new MeshLambertMaterial({ color: PALETTE.block, flatShading: true });
    for (const item of level.scenery) {
      const mesh = new Mesh(new BoxGeometry(item.size[0], item.size[1], item.size[2]), blockMat);
      mesh.position.set(item.pos[0], item.pos[1], item.pos[2]);
      s.add(mesh);
    }
  }

  /** Keep the (featureless) ground plane under the viewer. */
  update(view: Vector3): void {
    this.ground.position.set(view.x, 0, view.z);
  }

  private addRoad(path: Path): void {
    // Ribbon, extended a little past both ends since trucks keep driving.
    const overrun = 400;
    const p = new Vector3();
    const t = new Vector3();
    const positions: number[] = [];
    const index: number[] = [];
    let n = 0;
    for (let s = -overrun; s <= path.length + overrun; s += D.roadSegment) {
      path.pointAt(s, -path.width / 2, p);
      positions.push(p.x, p.y + 0.01, p.z);
      path.pointAt(s, path.width / 2, p);
      positions.push(p.x, p.y + 0.01, p.z);
      if (n > 0) {
        const a = (n - 1) * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      n++;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    this.scene.add(new Mesh(geo, new MeshLambertMaterial({ color: PALETTE.road })));

    // Lane dashes and roadside posts give speed and curve cues.
    const m = new Matrix4();
    const q = new Quaternion();
    const one = new Vector3(1, 1, 1);
    const place = (mesh: InstancedMesh, i: number, s: number, offset: number, y: number) => {
      path.pointAt(s, offset, p);
      path.tangentAt(s, t);
      q.setFromAxisAngle(UP, Math.atan2(t.x, t.z));
      p.y += y;
      mesh.setMatrixAt(i, m.compose(p, q, one));
    };

    const total = path.length + overrun * 2;
    const boundaries = path.lanes - 1;
    const dashRows = Math.floor(total / D.dashSpacing);
    if (boundaries > 0) {
      const dashes = new InstancedMesh(
        new BoxGeometry(0.25, 0.02, D.dashLength),
        new MeshLambertMaterial({ color: PALETTE.roadLine }),
        dashRows * boundaries,
      );
      for (let r = 0; r < dashRows; r++) {
        for (let b = 0; b < boundaries; b++) {
          const offset = (path.laneOffset(b) + path.laneOffset(b + 1)) / 2;
          place(dashes, r * boundaries + b, -overrun + r * D.dashSpacing, offset, 0.02);
        }
      }
      dashes.frustumCulled = false;
      this.scene.add(dashes);
    }

    const postRows = Math.floor(total / D.postSpacing);
    const posts = new InstancedMesh(
      new BoxGeometry(0.5, D.postHeight, 0.5),
      new MeshLambertMaterial({ color: PALETTE.post, flatShading: true }),
      postRows * 2,
    );
    const edge = path.width / 2 + D.postOffset - D.roadWidth / 2;
    for (let r = 0; r < postRows; r++) {
      const s = -overrun + r * D.postSpacing;
      place(posts, r * 2, s, -edge, D.postHeight / 2);
      place(posts, r * 2 + 1, s, edge, D.postHeight / 2);
    }
    posts.frustumCulled = false;
    this.scene.add(posts);
  }
}
