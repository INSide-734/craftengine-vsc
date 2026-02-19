import { Vector3d } from '../vector/Vector3d';
import { ResourceId } from './resource/ResourceId';
import { ResourceLoader } from './resource/ResourceLoader';
import { GeometricalModel, LayeredModel, Model } from './Model';
import { TextureCache } from './cache/TextureCache';
import { DirectionAxis, ALL_DIRECTIONS } from './Direction';
import {
  Axis,
  Direction,
  Element,
  ElementRotation,
  ImageData,
  ModelJson,
  ElementJson,
  FaceJson
} from '../types/index';
import { applyTintToImageData } from '../util/tint';

/**
 * 未解析的模型
 * 解析 JSON 模型文件，处理父链继承
 */
export class UnresolvedModel {
  private layered = false;
  private parent: UnresolvedModel | null = null;
  private readonly textureNames: Map<string, string>;
  private readonly elements: UnresolvedElement[];

  readonly ambientOcclusion: boolean | null;
  readonly rotation: Vector3d | null;
  readonly translation: Vector3d | null;
  readonly scale: Vector3d | null;

  constructor(
    id: ResourceId,
    public readonly loader: ResourceLoader,
    json: ModelJson
  ) {
    // 解析纹理映射
    this.textureNames = new Map(Object.entries(json.textures ?? {}));

    // 解析元素
    this.elements = (json.elements ?? []).map(e => new UnresolvedElement(this, e));

    // 解析 GUI 显示设置
    const gui = json.display?.gui;
    this.rotation = gui?.rotation ? new Vector3d(gui.rotation[0], gui.rotation[1], gui.rotation[2]) : null;
    this.translation = gui?.translation ? new Vector3d(gui.translation[0], gui.translation[1], gui.translation[2]) : null;
    this.scale = gui?.scale ? new Vector3d(gui.scale[0], gui.scale[1], gui.scale[2]) : null;
    this.ambientOcclusion = json.ambientocclusion ?? null;

    // 父模型在 init 中异步加载
    this._parentId = json.parent ?? null;
    this._id = id;
  }

  private _parentId: string | null;
  private _id: ResourceId;
  private _parentResolved = false;

  /**
   * 初始化父模型（异步）
   */
  private async resolveParent(): Promise<void> {
    if (this._parentResolved) {return;}
    this._parentResolved = true;

    if (this._parentId) {
      const parentId = ResourceId.of(this._parentId);
      if (parentId.toString() !== 'minecraft:builtin/generated') {
        try {
          this.parent = await this.loader.modelCache.get(this._parentId);
        } catch {
          // 如果父模型不存在，尝试使用回退策略
          const fallbackParent = this.getFallbackParent(parentId);
          if (fallbackParent) {
            try {
              this.parent = await this.loader.modelCache.get(fallbackParent);
            } catch {
              // 回退也失败，设置为 null
              this.parent = null;
            }
          } else {
            this.parent = null;
          }
        }
      } else {
        this.layered = true;
        this.parent = null;
      }
    } else if (this._id.path.startsWith('block/') && this._id.path !== 'block/block') {
      this.parent = await this.loader.modelCache.get('block/block');
    } else {
      this.parent = null;
    }
  }

  /**
   * 获取回退父模型
   * 当自定义模型不存在时，使用合适的原版模型作为回退
   */
  private getFallbackParent(parentId: ResourceId): string | null {
    const path = parentId.path;

    // block/custom/* -> block/cube_all（最常见的方块模型）
    if (path.startsWith('block/custom/') || path.startsWith('block/')) {
      return 'minecraft:block/cube_all';
    }

    // item/custom/* -> item/generated（最常见的物品模型）
    if (path.startsWith('item/custom/') || path.startsWith('item/')) {
      return 'minecraft:item/generated';
    }

    return null;
  }

  /**
   * 解析模型，处理继承链
   * @param tints 着色颜色数组，索引对应 tintindex
   */
  async resolve(tints?: number[]): Promise<Model> {
    await this.resolveParent();

    let elements: UnresolvedElement[] | null = null;
    const textures = new Map<string, string>();

    let ambientOcclusion: boolean | null = null;
    let rotation: Vector3d | null = this.rotation;
    let translation: Vector3d | null = this.translation;
    let scale: Vector3d | null = this.scale;

    let layered = false;
    let current: UnresolvedModel | null = this;

    // 遍历继承链
    while (current !== null) {
      await current.resolveParent();

      if (elements === null && current.elements.length > 0) {
        elements = current.elements;
      }

      for (const [key, value] of current.textureNames) {
        if (!textures.has(key)) {
          textures.set(key, value);
        }
      }

      if (rotation === null && translation === null && scale === null) {
        rotation = current.rotation;
        translation = current.translation;
        scale = current.scale;
      }

      if (ambientOcclusion === null) {
        ambientOcclusion = current.ambientOcclusion;
      }

      layered = current.layered;
      current = current.parent;
    }

    if (layered) {
      // 层叠模型（2D 物品）
      const layers: ImageData[] = [];
      let i = 0;
      while (true) {
        const texture = this.textureNames.get(`layer${i}`);
        if (!texture) {break;}
        let imageData = await this.loader.textureCache.get(texture, 0, 0, 0, 1, 1);
        // 对每个图层应用对应的 tint（layer0 -> tints[0]，layer1 -> tints[1]）
        if (tints && tints[i] !== undefined) {
          imageData = applyTintToImageData(imageData, tints[i]);
        }
        layers.push(imageData);
        i++;
      }
      return new LayeredModel(layers);
    } else {
      // 解析纹理别名 (#texture -> 实际路径)
      const resolvedTextures = new Map<string, string>();
      for (const [key, value] of textures) {
        let resolved = value;
        while (resolved.startsWith('#')) {
          const next = textures.get(resolved.substring(1));
          if (!next) {break;}
          resolved = next;
        }
        resolvedTextures.set(key, resolved);
      }

      const resolvedElements: Element[] = [];
      if (elements) {
        for (const element of elements) {
          resolvedElements.push(await element.resolve(resolvedTextures, tints));
        }
      }

      return new GeometricalModel(
        resolvedElements,
        ambientOcclusion ?? true,
        rotation ?? Vector3d.ZERO,
        translation ?? Vector3d.ZERO,
        scale ?? Vector3d.ONE
      );
    }
  }
}

/**
 * 未解析的元素
 */
class UnresolvedElement {
  readonly from: Vector3d;
  readonly to: Vector3d;
  private readonly rotation: ElementRotation | null;
  private readonly faces: Map<Direction, UnresolvedTexture>;

  constructor(
    public readonly model: UnresolvedModel,
    json: ElementJson
  ) {
    this.from = new Vector3d(json.from[0] / 16, json.from[1] / 16, json.from[2] / 16);
    this.to = new Vector3d(json.to[0] / 16, json.to[1] / 16, json.to[2] / 16);

    if (json.rotation) {
      this.rotation = {
        origin: new Vector3d(
          json.rotation.origin[0] / 16,
          json.rotation.origin[1] / 16,
          json.rotation.origin[2] / 16
        ),
        axis: json.rotation.axis.toLowerCase() as Axis,
        angle: json.rotation.angle,
        rescale: json.rotation.rescale ?? false
      };
    } else {
      this.rotation = null;
    }

    this.faces = new Map();
    if (json.faces) {
      for (const [dir, face] of Object.entries(json.faces)) {
        // JSON 中的方向是小写，直接作为 Direction 枚举值使用
        const direction = dir.toLowerCase() as Direction;
        this.faces.set(direction, new UnresolvedTexture(this, direction, face));
      }
    }
  }

  async resolve(textures: Map<string, string>, tints?: number[]): Promise<Element> {
    const faceTextures = new Map<Direction, ImageData>();

    for (const [dir, unresolvedTex] of this.faces) {
      faceTextures.set(dir, await unresolvedTex.resolve(textures, tints));
    }

    // 填充缺失的面
    for (const dir of ALL_DIRECTIONS) {
      if (!faceTextures.has(dir)) {
        faceTextures.set(dir, TextureCache.EMPTY_TEXTURE);
      }
    }

    return {
      from: this.from,
      to: this.to,
      rotation: this.rotation,
      faces: faceTextures
    };
  }
}

/**
 * 未解析的纹理
 */
class UnresolvedTexture {
  private readonly texture: string;
  private readonly rotation: number;
  private readonly fromX: number;
  private readonly fromY: number;
  private readonly toX: number;
  private readonly toY: number;
  private readonly tintindex: number | undefined;

  constructor(
    private readonly element: UnresolvedElement,
    direction: Direction,
    json: FaceJson
  ) {
    this.texture = json.texture.replace(/^#/, '');
    this.rotation = json.rotation ?? 0;
    this.tintindex = json.tintindex;

    if (json.uv) {
      this.fromX = json.uv[0] / 16;
      this.fromY = json.uv[1] / 16;
      this.toX = json.uv[2] / 16;
      this.toY = json.uv[3] / 16;
    } else {
      const dynamicUV = this.getDynamicUV(this.element, direction);
      this.fromX = dynamicUV[0];
      this.fromY = dynamicUV[1];
      this.toX = dynamicUV[2];
      this.toY = dynamicUV[3];
    }
  }

  async resolve(textures: Map<string, string>, tints?: number[]): Promise<ImageData> {
    const texturePath = textures.get(this.texture);

    // 如果纹理未定义或仍是变量引用，返回空纹理（模板模型的正常情况）
    if (!texturePath || texturePath.startsWith('#')) {
      return TextureCache.EMPTY_TEXTURE;
    }

    let imageData = await this.element.model.loader.textureCache.get(
      texturePath,
      this.rotation,
      this.fromX, this.fromY,
      this.toX, this.toY
    );

    // 如果此面有 tintindex 且提供了对应的 tint 颜色，应用着色
    if (this.tintindex !== undefined && tints && tints[this.tintindex] !== undefined) {
      imageData = applyTintToImageData(imageData, tints[this.tintindex]);
    }

    return imageData;
  }

  private getDynamicUV(parent: UnresolvedElement, direction: Direction): [number, number, number, number] {
    const fromPos = parent.from.toArray().map(v => v - 0.5);
    const toPos = parent.to.toArray().map(v => v - 0.5);

    let axisHor: number;
    let axisVert: number;
    const axis = DirectionAxis[direction];

    switch (axis) {
      case Axis.X: // west or east
        axisHor = 2; // z
        axisVert = 1; // y
        break;
      case Axis.Y: // up or down
        axisHor = 0; // x
        axisVert = 2; // z
        break;
      case Axis.Z: // north or south
        axisHor = 0; // x
        axisVert = 1; // y
        break;
    }

    let nx = -1;
    let ny = -1;
    if (direction === Direction.WEST || direction === Direction.SOUTH) {
      nx = 1;
    } else if (direction === Direction.UP) {
      ny = 1;
      nx = 1;
    }

    const xVals = [fromPos[axisHor] * nx, toPos[axisHor] * nx].sort((a, b) => a - b);
    const yVals = [fromPos[axisVert] * ny, toPos[axisVert] * ny].sort((a, b) => a - b);

    return [xVals[0] + 0.5, yVals[0] + 0.5, xVals[1] + 0.5, yVals[1] + 0.5];
  }
}
