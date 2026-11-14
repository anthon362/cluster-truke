import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  DoubleSide,
  PlaneGeometry,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { TUNING } from '../config/tuning';
import type { Goal } from '../level/goal';
import type { Hazard, HazardPart } from '../level/hazards';
import type { LevelDef } from '../level/schema';
import type { Path } from '../trucks/path';
import { PALETTE, SCENE_DIMS as D } from './palette';

const UP = new Vector3(0, 1, 0);

/** Static visuals for a level: ground, road ribbons with lane dashes, posts, scenery. */
export class LevelScene {
  readonly scene = new Scene();
  private readonly ground: Mesh;
  private readonly roadColor: Color;
  private readonly hazardMeshes: { part: HazardPart; mesh: Mesh }[] = [];

  constructor(level: LevelDef, paths: Iterable<Path>, goal: Goal, hazards: readonly Hazard[]) {
    const s = this.scene;
    const pal = level.palette;
    this.roadColor = new Color(pal.road ?? PALETTE.road);
    s.background = new Color(pal.sky);
    s.fog = new Fog(pal.fog, PALETTE.fogNear, pal.fogFar);
    s.add(new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.6));
    const sun = new DirectionalLight(PALETTE.sun, 2.2);
    sun.position.set(-0.5, 1, -0.35);
    s.add(sun);

    // With no solid ground the same plane is drawn at the kill height (water, a pit floor).
    this.ground = new Mesh(
      new PlaneGeometry(D.groundSize, D.groundSize),
      new MeshLambertMaterial({ color: pal.ground }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = level.ground === 'none' ? level.killY : 0;
    s.add(this.ground);

    for (const path of paths) if (path.visible) this.addRoad(path);

    this.addGoal(goal);

    const deg = Math.PI / 180;
    const mats = new Map<string, MeshLambertMaterial>();
    for (const item of level.scenery) {
      const color = item.color ?? '#8a5a44';
      let mat = mats.get(color);
      if (!mat) {
        mat = new MeshLambertMaterial({ color, flatShading: true });
        mats.set(color, mat);
      }
      const mesh = new Mesh(new BoxGeometry(item.size[0], item.size[1], item.size[2]), mat);
      mesh.position.set(item.pos[0], item.pos[1], item.pos[2]);
      const r = item.rot ?? [0, 0, 0];
      mesh.rotation.copy(new Euler(r[0] * deg, r[1] * deg, r[2] * deg, 'XYZ'));
      s.add(mesh);
    }

    // Hazards: one box mesh per part, sharing geometry and material where possible.
    const geos = new Map<string, BoxGeometry>();
    const hazardMats = new Map<number, MeshLambertMaterial>();
    for (const hazard of hazards) {
      for (const part of hazard.parts) {
        const gk = `${part.size.x},${part.size.y},${part.size.z}`;
        let geo = geos.get(gk);
        if (!geo) {
          geo = new BoxGeometry(part.size.x, part.size.y, part.size.z);
          geos.set(gk, geo);
        }
        let mat = hazardMats.get(part.color);
        if (!mat) {
          mat = new MeshLambertMaterial({ color: part.color, flatShading: true });
          hazardMats.set(part.color, mat);
        }
        const mesh = new Mesh(geo, mat);
        s.add(mesh);
        this.hazardMeshes.push({ part, mesh });
      }
    }
  }

  /** Free GPU resources when switching level. */
  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mat = m.material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }

  /** Keep the (featureless) ground plane under the viewer. */
  update(view: Vector3, alpha: number): void {
    if (this.ground) {
      this.ground.position.x = view.x;
      this.ground.position.z = view.z;
    }
    for (const { part, mesh } of this.hazardMeshes) {
      mesh.visible = part.visible;
      if (!part.visible) continue;
      mesh.position.lerpVectors(part.prevPos, part.pos, alpha);
      mesh.quaternion.slerpQuaternions(part.prevRot, part.rot, alpha);
    }
  }

  /** A bright gate that ignores fog, so it reads from far away. */
  private addGoal(goal: Goal): void {
    const yaw = Math.atan2(goal.normal.x, goal.normal.z);
    const w = goal.halfWidth * 2;
    const pw = TUNING.goal.pillarWidth;
    const frameMat = new MeshBasicMaterial({ color: PALETTE.goalPillar, fog: false });
    const sheet = new Mesh(
      new PlaneGeometry(w, goal.height),
      new MeshBasicMaterial({
        color: PALETTE.goal,
        transparent: true,
        opacity: 0.28,
        side: DoubleSide,
        depthWrite: false,
        fog: false,
      }),
    );
    sheet.position.set(0, goal.height / 2, 0);
    const group = new Mesh();
    group.add(sheet);
    for (const side of [-1, 1]) {
      const pillar = new Mesh(new BoxGeometry(pw, goal.height + pw, pw), frameMat);
      pillar.position.set(side * (w / 2 + pw / 2), (goal.height + pw) / 2, 0);
      group.add(pillar);
    }
    const beam = new Mesh(new BoxGeometry(w + pw * 2, pw, pw), frameMat);
    beam.position.set(0, goal.height + pw / 2, 0);
    group.add(beam);
    group.position.copy(goal.centre);
    group.rotation.y = yaw;
    this.scene.add(group);
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
    this.scene.add(new Mesh(geo, new MeshLambertMaterial({ color: this.roadColor })));

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
