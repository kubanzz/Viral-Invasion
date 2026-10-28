import Phaser from 'phaser';

/** Built by the art pipeline. Runtime loading never reads JSON or PNG via XHR. */
export interface PhaserArtData {
  atlases?: readonly { key: string; dataUri: string; data: object }[];
  images?: readonly { key: string; dataUri: string }[];
}

export interface HostedSprite {
  texture: string;
  frame?: string | number;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  alpha?: number;
  flipX?: boolean;
  flipY?: boolean;
  originX?: number;
  originY?: number;
  rotation?: number;
  tint?: number;
  visible?: boolean;
}

interface RasterLayer {
  texture: Phaser.Textures.CanvasTexture;
  image: Phaser.GameObjects.Image;
  /** Full-screen layers have their own stable producer canvas. */
  sharedSource?: HTMLCanvasElement;
}

/** Owns presentation and its sole browser loop; it never owns or advances game rules. */
export class PhaserHost {
  readonly ready: Promise<void>;
  private readonly game: Phaser.Game;
  private currentScene?: Phaser.Scene;
  private resolveReady!: () => void;
  private rejectReady!: (reason: unknown) => void;
  private booted = false;
  private failed = false;
  private destroyed = false;
  private frameCallback?: (now: number) => void;
  private readonly layers = new Map<string, RasterLayer>();
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly spareSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly seenSprites = new Set<string>();
  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;
  private readonly step = (now: number): void => { this.frameCallback?.(now); };
  private readonly creationError = (): void => {
    this.fail(new Error('无法创建 WebGL 画面，请启用浏览器硬件加速后重试。'));
  };

  constructor(private readonly canvas: HTMLCanvasElement, artData: PhaserArtData = {}) {
    const assetKeys = new Set<string>();
    for (const asset of [...(artData.atlases ?? []), ...(artData.images ?? [])]) {
      if (assetKeys.has(asset.key)) throw new Error(`Duplicate art texture: ${asset.key}`);
      if (!asset.dataUri.startsWith('data:image/')) throw new Error(`Art texture must be an inline image: ${asset.key}`);
      assetKeys.add(asset.key);
    }
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    const rect = canvas.getBoundingClientRect();
    this.cssWidth = Math.max(1, rect.width || window.innerWidth);
    this.cssHeight = Math.max(1, rect.height || window.innerHeight);
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.addEventListener('webglcontextcreationerror', this.creationError);
    const host = this;
    class PresentationScene extends Phaser.Scene {
      constructor() { super('presentation'); }
      preload(): void {
        this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
          host.fail(new Error(`美术资源加载失败：${file.key}`));
        });
        for (const atlas of artData.atlases ?? []) {
          this.load.atlas(atlas.key, atlas.dataUri, atlas.data);
        }
        for (const image of artData.images ?? []) this.load.image(image.key, image.dataUri);
      }
      create(): void {
        if (host.destroyed || host.failed) return;
        host.currentScene = this;
        host.booted = true;
        host.resize(host.cssWidth, host.cssHeight, host.dpr);
        host.resolveReady();
      }
    }
    // A supplied canvas requires an explicit renderer. It must never first get a 2D context.
    this.game = new Phaser.Game({
      type: Phaser.WEBGL,
      canvas,
      width: Math.round(this.cssWidth * this.dpr),
      height: Math.round(this.cssHeight * this.dpr),
      banner: false,
      backgroundColor: '#120d1b',
      audio: { noAudio: true },
      input: { keyboard: false, mouse: false, touch: false, gamepad: false },
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.NO_CENTER,
        zoom: 1 / this.dpr,
        autoRound: false,
      },
      render: { antialias: true, pixelArt: false, roundPixels: false },
      scene: PresentationScene,
    });
  }

  private fail(reason: unknown): void {
    this.failed = true;
    this.rejectReady(reason);
  }

  /** Available after ready; callers can define genuine atlas animations with Phaser. */
  get scene(): Phaser.Scene {
    if (!this.currentScene || this.destroyed) throw new Error('Phaser presentation is not ready.');
    return this.currentScene;
  }

  get isReady(): boolean { return this.booted && !this.destroyed; }

  /** PRE_STEP runs before sprite animation updates and rendering. Do not add another rAF. */
  startFrameLoop(callback: (now: number) => void): void {
    if (!this.booted || this.destroyed) throw new Error('Await PhaserHost.ready before starting the frame loop.');
    if (this.frameCallback) {
      if (this.frameCallback !== callback) throw new Error('PhaserHost already owns a frame callback.');
      return;
    }
    this.frameCallback = callback;
    this.game.events.on(Phaser.Core.Events.PRE_STEP, this.step);
  }

  /** Coordinates exposed by this host are CSS pixels, irrespective of backing-store DPR. */
  resize(widthCSS: number, heightCSS: number, requestedDpr = window.devicePixelRatio || 1): void {
    this.cssWidth = Math.max(1, Number.isFinite(widthCSS) ? widthCSS : 1);
    this.cssHeight = Math.max(1, Number.isFinite(heightCSS) ? heightCSS : 1);
    this.dpr = Math.max(1, Math.min(2, Number.isFinite(requestedDpr) ? requestedDpr : 1));
    if (!this.booted || this.destroyed) return;
    const width = Math.round(this.cssWidth * this.dpr), height = Math.round(this.cssHeight * this.dpr);
    this.game.scale.setZoom(1 / this.dpr);
    this.game.scale.resize(width, height);
    this.canvas.style.width = `${this.cssWidth}px`;
    this.canvas.style.height = `${this.cssHeight}px`;
    this.scene.cameras.main.setViewport(0, 0, width, height).setOrigin(0, 0).setZoom(this.dpr);
    this.game.scale.updateBounds();
  }

  /** Full-screen canvases have independent sources; smaller reusable buffers are copied. */
  setRasterLayer(key: string, source: HTMLCanvasElement, depth: number,
    widthCSS = this.cssWidth, heightCSS = this.cssHeight, xCSS = 0, yCSS = 0, dirty = true): void {
    const scene = this.scene;
    let layer = this.layers.get(key);
    const shareSource = key === 'ground' || key === 'signals';
    // Recreate rather than setSize on shared sources: setSize clears the canvas
    // after the producer has already painted the first frame at the new size.
    if (layer?.sharedSource && (layer.sharedSource !== source || layer.texture.width !== source.width || layer.texture.height !== source.height)) {
      layer.image.destroy(); scene.textures.remove(layer.texture.key); this.layers.delete(key); layer = undefined;
    }
    if (!layer) {
      const textureKey = `__vi_raster_${key}`;
      const texture = shareSource ? scene.textures.addCanvas(textureKey, source)
        : scene.textures.createCanvas(textureKey, Math.max(1, source.width), Math.max(1, source.height));
      if (!texture) throw new Error(`Unable to create raster texture: ${key}`);
      layer = { texture, image: scene.add.image(0, 0, textureKey).setOrigin(0), sharedSource: shareSource ? source : undefined };
      this.layers.set(key, layer);
      dirty = true;
    }
    if (layer.texture.width !== source.width || layer.texture.height !== source.height) {
      layer.texture.setSize(Math.max(1, source.width), Math.max(1, source.height));
      dirty = true;
    }
    if (dirty) {
      if (!layer.sharedSource) {
        layer.texture.context.clearRect(0, 0, layer.texture.width, layer.texture.height);
        if (source.width > 0 && source.height > 0) layer.texture.context.drawImage(source, 0, 0);
      }
      layer.texture.refresh();
    }
    layer.image.setPosition(xCSS, yCSS).setDisplaySize(widthCSS, heightCSS).setDepth(depth).setVisible(true);
  }

  hideRasterLayer(key: string): void { this.layers.get(key)?.image.setVisible(false); }

  removeRasterLayer(key: string): void {
    const layer = this.layers.get(key);
    if (!layer) return;
    layer.image.destroy();
    this.scene.textures.remove(layer.texture.key);
    this.layers.delete(key);
  }

  beginFrame(): void { this.seenSprites.clear(); }

  /** Reuses native Sprites. Animations remain opt-in and cannot change simulation state. */
  sprite(id: string, config: HostedSprite): Phaser.GameObjects.Sprite {
    const scene = this.scene;
    let sprite = this.sprites.get(id);
    if (!sprite) {
      sprite = this.spareSprites.pop() ?? scene.add.sprite(config.x, config.y, config.texture, config.frame);
      sprite.anims.stop();
      sprite.setTexture(config.texture, config.frame);
      sprite.setActive(true);
      this.sprites.set(id, sprite);
    }
    this.seenSprites.add(id);
    if (sprite.texture.key !== config.texture || (config.frame !== undefined && sprite.frame.name !== String(config.frame))) {
      sprite.setTexture(config.texture, config.frame);
    }
    sprite.setPosition(config.x, config.y).setOrigin(config.originX ?? .5, config.originY ?? 1)
      .setDisplaySize(config.width, config.height).setDepth(config.depth)
      .setAlpha(config.alpha ?? 1).setFlip(config.flipX ?? false, config.flipY ?? false)
      .setRotation(config.rotation ?? 0).setVisible(config.visible ?? true);
    if (config.tint === undefined) sprite.clearTint(); else sprite.setTint(config.tint);
    return sprite;
  }

  endFrame(): void {
    for (const [id, sprite] of this.sprites) {
      if (this.seenSprites.has(id)) continue;
      this.sprites.delete(id);
      sprite.anims.stop();
      sprite.setActive(false).setVisible(false);
      if (this.spareSprites.length < 128) this.spareSprites.push(sprite); else sprite.destroy();
    }
  }

  diagnostics() {
    return {
      engine: 'Phaser', version: Phaser.VERSION, renderer: 'webgl', ready: this.booted && !this.destroyed,
      textureCount: this.currentScene && !this.destroyed ? this.currentScene.textures.getTextureKeys().length : 0,
      activeSprites: this.sprites.size, pooledSprites: this.spareSprites.length, rasterLayers: this.layers.size,
      visibleRasterLayers: [...this.layers.values()].filter(layer => layer.image.visible).length,
      animations: [...this.sprites].flatMap(([id, sprite]) => sprite.anims.currentAnim ? [{
        id, key: sprite.anims.currentAnim.key, frame: sprite.frame.name,
        isPlaying: sprite.anims.isPlaying, isPaused: sprite.anims.isPaused,
      }] : []),
      nativeSprites: [...this.sprites].map(([id, sprite]) => ({
        id, texture: sprite.texture.key, frame: sprite.frame.name, x: sprite.x, y: sprite.y,
        width: sprite.displayWidth, height: sprite.displayHeight, depth: sprite.depth, visible: sprite.visible,
      })),
      widthCSS: this.cssWidth, heightCSS: this.cssHeight, dpr: this.dpr,
      backingWidth: this.canvas.width, backingHeight: this.canvas.height,
      frameLoopBound: !!this.frameCallback,
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.game.events.off(Phaser.Core.Events.PRE_STEP, this.step);
    this.frameCallback = undefined;
    this.canvas.removeEventListener('webglcontextcreationerror', this.creationError);
    if (!this.booted) this.rejectReady(new Error('Phaser presentation was destroyed before it became ready.'));
    this.sprites.clear();
    this.spareSprites.length = 0;
    this.layers.clear();
    // Preserve the visible canvas and existing native Controller event listeners.
    this.game.destroy(false);
    this.currentScene = undefined;
  }
}
