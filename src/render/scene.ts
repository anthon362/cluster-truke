import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Scene,
} from 'three';
import { PALETTE, SCENE_DIMS as D } from './palette';

const m4 = new Matrix4();

/**
 * Endless flat test road for M1. Dashes and roadside posts are recycled
 * around the viewer so there are always motion cues without real level data.
 */
export class TestScene {
  readonly scene = new Scene();
  private readonly ground: Mesh;
  private readonly road: Mesh;
  private readonly dashes: InstancedMesh;
  private readonly posts: InstancedMesh;

  constructor() {
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

    this.road = new Mesh(
      new PlaneGeometry(D.roadWidth, D.groundSize),
      new MeshLambertMaterial({ color: PALETTE.road }),
    );
    this.road.rotation.x = -Math.PI / 2;
    this.road.position.y = 0.01;
    s.add(this.road);

    this.dashes = new InstancedMesh(
      new BoxGeometry(0.25, 0.02, D.dashLength),
      new MeshLambertMaterial({ color: PALETTE.roadLine }),
      D.dashCount * 2,
    );
    this.dashes.frustumCulled = false;
    s.add(this.dashes);

    this.posts = new InstancedMesh(
      new BoxGeometry(0.5, D.postHeight, 0.5),
      new MeshLambertMaterial({ color: PALETTE.post, flatShading: true }),
      D.postCount * 2,
    );
    this.posts.frustumCulled = false;
    s.add(this.posts);
    this.update(0);
  }

  /** Recentre the endless scenery on the viewer's Z. */
  update(viewZ: number): void {
    this.ground.position.z = viewZ;
    this.road.position.z = viewZ;

    const laneX = D.roadWidth / 6;
    const dashBase = Math.floor(viewZ / D.dashSpacing) * D.dashSpacing;
    for (let i = 0; i < D.dashCount; i++) {
      const z = dashBase + (i - D.dashCount / 3) * D.dashSpacing;
      this.dashes.setMatrixAt(i * 2, m4.makeTranslation(-laneX, 0.02, z));
      this.dashes.setMatrixAt(i * 2 + 1, m4.makeTranslation(laneX, 0.02, z));
    }
    this.dashes.instanceMatrix.needsUpdate = true;

    const postBase = Math.floor(viewZ / D.postSpacing) * D.postSpacing;
    for (let i = 0; i < D.postCount; i++) {
      const z = postBase + (i - D.postCount / 3) * D.postSpacing;
      this.posts.setMatrixAt(i * 2, m4.makeTranslation(-D.postOffset, D.postHeight / 2, z));
      this.posts.setMatrixAt(i * 2 + 1, m4.makeTranslation(D.postOffset, D.postHeight / 2, z));
    }
    this.posts.instanceMatrix.needsUpdate = true;
  }
}
