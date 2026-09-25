// Sky, sun, day/night, clouds, water and smoke for Birdie.
//
//  - a physical sky (three's Sky shader) lit by a sun that moves through a
//    full day; stars and a moon fade in at night
//  - fog that matches the horizon, tinted by where you are: red haze over
//    industry, cold blue over the snow, city smog low down (in Fly Like a
//    Bird 2 you could "rise through the smog of the city into a clear sky")
//  - a reflection probe of the sky (PMREM) so water and glass reflect it
//  - billboard clouds drifting overhead, smoke from chimneys and towers
//  - an endless water plane with scrolling ripples

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { puffTexture, waterNormals } from "./textures.js";
import { clamp, lerp, smoothstep, mulberry32 } from "./noise.js";

// Many camera-facing soft sprites (clouds, smoke) in ONE draw call: an
// instanced quad whose vertex shader turns each copy to face the camera.
class Billboards {
  constructor(scene, texture, max, fog) {
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute("position", quad.attributes.position);
    geo.setAttribute("uv", quad.attributes.uv);
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aCenter", this.center);
    geo.setAttribute("aSize", this.size);
    geo.setAttribute("aAlpha", this.alpha);
    geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { tMap: { value: texture }, uColor: { value: new THREE.Color(1, 1, 1) }, uOpacity: { value: 1 } }]),
      vertexShader: `
        attribute vec3 aCenter; attribute vec2 aSize; attribute float aAlpha;
        varying vec2 vUv; varying float vAlpha;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv; vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(aCenter, 1.0);
          mvPosition.xy += position.xy * aSize;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D tMap; uniform vec3 uColor; uniform float uOpacity;
        varying vec2 vUv; varying float vAlpha;
        #include <fog_pars_fragment>
        void main() {
          vec4 t = texture2D(tMap, vUv);
          gl_FragColor = vec4(uColor * t.rgb, t.a * vAlpha * uOpacity);
          if (gl_FragColor.a < 0.01) discard;
          #include <fog_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, fog,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.geo = geo;
    this.max = max;
    scene.add(this.mesh);
  }
  set(i, x, y, z, sx, sy, a) {
    this.center.setXYZ(i, x, y, z);
    this.size.setXY(i, sx, sy);
    this.alpha.setX(i, a);
  }
  commit(n) {
    this.geo.instanceCount = n;
    this.center.needsUpdate = true; this.size.needsUpdate = true; this.alpha.needsUpdate = true;
  }
}

export class SkySystem {
  constructor(renderer, scene, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.dayLength = opts.dayLength ?? 1200;   // seconds for a full day
    this.time = opts.startTime ?? 0.3;         // 0..1, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    this.frozen = false;

    // --- sky dome ---
    this.sky = new Sky();
    this.sky.scale.setScalar(9000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    this.sky.material.depthWrite = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.sunDir = new THREE.Vector3();

    // --- lights ---
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3);
    this.sun.castShadow = opts.shadows !== false;
    this.sun.shadow.mapSize.set(opts.shadowSize || 2048, opts.shadowSize || 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a5040, 1.1);
    scene.add(this.hemi);
    this.moonLight = new THREE.DirectionalLight(0x9bb4ff, 0);
    scene.add(this.moonLight);
    scene.add(this.moonLight.target);

    // --- fog ---
    scene.fog = new THREE.Fog(0xbfd4e8, 250, 1100);
    this.fogColor = new THREE.Color();

    // --- stars ---
    const starGeo = new THREE.BufferGeometry();
    const rnd = mulberry32(42);
    const sp = [], sc2 = [];
    for (let i = 0; i < 2500; i++) {
      const u1 = rnd() * 2 - 1, a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - u1 * u1);
      if (u1 < -0.1) continue;
      sp.push(Math.cos(a) * r * 4000, u1 * 4000, Math.sin(a) * r * 4000);
      const b = 0.5 + rnd() * 0.5;
      sc2.push(b, b, b * (0.9 + rnd() * 0.2));
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    starGeo.setAttribute("color", new THREE.Float32BufferAttribute(sc2, 3));
    this.starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    // --- moon ---
    const mc = document.createElement("canvas");
    mc.width = mc.height = 128;
    const g = mc.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,252,235,1)"); grd.addColorStop(0.45, "rgba(250,245,225,1)"); grd.addColorStop(0.5, "rgba(250,245,225,0.25)"); grd.addColorStop(1, "rgba(250,245,225,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "rgba(180,175,160,0.4)";
    for (const [x, y, r] of [[52, 50, 7], [74, 70, 9], [60, 78, 5], [80, 48, 4]]) { g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); }
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), fog: false, transparent: true, depthWrite: false }));
    this.moon.scale.setScalar(260);
    scene.add(this.moon);

    // --- clouds: soft billboards scattered in a big ring around the camera ---
    this.cloudTex = puffTexture();
    this.clouds = [];
    this.cloudBB = new Billboards(scene, this.cloudTex, 80, false);
    this.cloudBB.mesh.renderOrder = -5;
    this.cloudBB.mat.uniforms.uOpacity.value = 0.85;
    this.cloudMat = { color: this.cloudBB.mat.uniforms.uColor.value };
    const crnd = mulberry32(7);
    for (let i = 0; i < 70; i++) {
      const scale = 120 + crnd() * 260;
      this.clouds.push({ off: new THREE.Vector3((crnd() - 0.5) * 3000, 180 + crnd() * 170, (crnd() - 0.5) * 3000), sx: scale, sy: scale * 0.45 });
    }
    this.wind = new THREE.Vector2(3, 1.2);
    this.cloudDrift = new THREE.Vector2();

    // --- water ---
    const wn = waterNormals();
    wn.repeat.set(160, 160);
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x2f6f8a, roughness: 0.08, metalness: 0.15, normalMap: wn,
      normalScale: new THREE.Vector2(0.45, 0.45), transparent: true, opacity: 0.9, envMapIntensity: 1.2,
    });
    const wg = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    wg.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wg, this.waterMat);
    this.water.receiveShadow = true;
    this.water.renderOrder = 1;
    scene.add(this.water);

    // --- smoke particles (chimneys, cooling towers) ---
    this.puffs = [];
    this.smokeBB = new Billboards(scene, this.cloudTex, 320, true);

    // --- sky reflections for water and glass ---
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    this.envTimer = 0;
    this.envRT = null;
    this.tint = new THREE.Color(1, 1, 1);
    this.update(0, new THREE.Vector3(), { industry: 0, snow: 0, city: 0, island: 0, hills: 0 }, 0, true);
  }

  // how dark it is: 0 = full day, 1 = night
  get night() {
    const e = Math.sin((this.time - 0.25) * Math.PI * 2);
    return 1 - smoothstep(-0.18, 0.12, e);
  }

  timeLabel() {
    const hours = (this.time * 24 + 24) % 24;
    const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  update(dt, camPos, biomeW, altitude, force) {
    if (!this.frozen) this.time = (this.time + dt / this.dayLength) % 1;
    // sun path: rises in the east (+x), high in the south, sets in the west
    const ang = (this.time - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang), elev, 0.35).normalize();
    const sunUp = smoothstep(-0.08, 0.1, elev);
    const night = this.night;
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
    // hazier near sunrise/sunset
    u.turbidity.value = lerp(3.5, 9, 1 - smoothstep(0.05, 0.4, Math.abs(elev)));
    u.rayleigh.value = lerp(1.2, 3, 1 - smoothstep(0.0, 0.35, Math.abs(elev))) * (1 - night * 0.6);
    this.sky.position.copy(camPos);

    // sun light follows the camera so shadows stay sharp around the bird
    this.sun.position.copy(camPos).addScaledVector(this.sunDir, 300);
    this.sun.target.position.copy(camPos);
    const warm = 1 - smoothstep(0.05, 0.45, elev);
    this.sun.color.setRGB(1, lerp(0.95, 0.62, warm), lerp(0.88, 0.4, warm));
    this.sun.intensity = 3.2 * sunUp;
    this.sun.castShadow = this.sun.intensity > 0.05 && this.shadowsWanted !== false;
    this.hemi.intensity = lerp(1.15, 0.22, night);
    this.hemi.color.setRGB(lerp(0.72, 0.25, night), lerp(0.84, 0.32, night), lerp(1, 0.55, night));
    this.hemi.groundColor.setRGB(lerp(0.36, 0.08, night), lerp(0.32, 0.08, night), lerp(0.26, 0.12, night));

    // moon opposite the sun
    const moonDir = this.sunDir.clone().multiplyScalar(-1);
    moonDir.y = Math.abs(moonDir.y) * 0.8 + 0.15;
    moonDir.normalize();
    this.moon.position.copy(camPos).addScaledVector(moonDir, 3500);
    this.moon.material.opacity = night;
    this.moonLight.position.copy(camPos).addScaledVector(moonDir, 300);
    this.moonLight.target.position.copy(camPos);
    this.moonLight.intensity = night * 0.45;
    this.stars.position.copy(camPos);
    this.starMat.opacity = night * 0.95;

    // fog colour: sky near the horizon, tinted by region, darkened at night
    const day = new THREE.Color(0.72, 0.82, 0.93);
    const dusk = new THREE.Color(0.95, 0.66, 0.45);
    const dark = new THREE.Color(0.05, 0.07, 0.13);
    const fc = this.fogColor.copy(day).lerp(dusk, warm * sunUp).lerp(dark, night);
    const ind = biomeW.industry || 0, snow = biomeW.snow || 0, city = biomeW.city || 0;
    this.tint.setRGB(1, 1, 1).lerp(new THREE.Color(1.15, 0.72, 0.6), ind * 0.8).lerp(new THREE.Color(0.95, 1, 1.08), snow * 0.5);
    fc.multiply(this.tint);
    // city smog low down, clearing as you climb
    const smog = city * (1 - smoothstep(40, 160, altitude)) * (1 - night * 0.5);
    fc.lerp(new THREE.Color(0.7, 0.68, 0.6), smog * 0.35);
    this.scene.fog.color.copy(fc);
    this.scene.fog.near = lerp(260, 90, Math.max(smog * 0.8, ind * 0.6)) * (this.fogScale || 1);
    this.scene.fog.far = lerp(1150, 650, Math.max(smog * 0.6, ind * 0.5)) * (this.fogScale || 1);
    this.renderer.toneMappingExposure = lerp(0.6, 0.42, night) * (1 + ind * 0.05);

    // clouds: drift with the wind, wrap around the camera, lit by the sun
    this.cloudDrift.addScaledVector(this.wind, dt);
    const cloudCol = new THREE.Color(1, 1, 1).lerp(new THREE.Color(1, 0.72, 0.55), warm * sunUp).lerp(new THREE.Color(0.18, 0.2, 0.28), night);
    cloudCol.multiply(this.tint);
    this.cloudMat.color.copy(cloudCol);
    this.clouds.forEach((c, i) => {
      const o = c.off;
      const x = ((((o.x + this.cloudDrift.x - camPos.x) % 3000) + 4500) % 3000) - 1500;
      const z = ((((o.z + this.cloudDrift.y - camPos.z) % 3000) + 4500) % 3000) - 1500;
      this.cloudBB.set(i, camPos.x + x, o.y + ind * 60, camPos.z + z, c.sx, c.sy, 1);
    });
    this.cloudBB.commit(this.clouds.length);

    // water follows the camera (snapped so the ripples don't slide)
    this.water.position.set(Math.round(camPos.x / 37.5) * 37.5, 0, Math.round(camPos.z / 37.5) * 37.5);
    const wn = this.waterMat.normalMap;
    wn.offset.x = (this.water.position.x / 6000) * 160 + performance.now() * 0.000012;
    wn.offset.y = -(this.water.position.z / 6000) * 160 + performance.now() * 0.000008;
    this.waterMat.color.setRGB(lerp(0.17, 0.03, night), lerp(0.42, 0.06, night), lerp(0.52, 0.12, night)).multiply(this.tint);

    // refresh the sky reflection now and then (it's slow-ish)
    this.envTimer -= dt;
    if (this.envTimer <= 0 || force) {
      this.envTimer = 8;
      const eu = this.envSky.material.uniforms;
      for (const k of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG"]) eu[k].value = u[k].value;
      eu.sunPosition.value.copy(u.sunPosition.value);
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = lerp(0.9, 0.08, night);
    }
  }

  // ---------------- smoke ----------------
  emitSmoke(x, y, z, big) {
    if (this.puffs.length >= 300) return;
    const size = big ? 18 + Math.random() * 10 : 4 + Math.random() * 3;
    this.puffs.push({
      p: new THREE.Vector3(x + (Math.random() - 0.5) * (big ? 12 : 1), y, z + (Math.random() - 0.5) * (big ? 12 : 1)),
      v: new THREE.Vector3((Math.random() - 0.5) * 0.6, big ? 3 + Math.random() * 2 : 2 + Math.random(), (Math.random() - 0.5) * 0.6),
      life: 0, max: big ? 14 : 9, size, grow: big ? 3 : 1.5,
    });
  }

  updateSmoke(dt) {
    let n = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const d = this.puffs[i];
      d.life += dt;
      d.p.addScaledVector(d.v, dt);
      d.p.x += this.wind.x * dt * 0.8;
      d.p.z += this.wind.y * dt * 0.8;
      if (d.life > d.max) { this.puffs.splice(i, 1); continue; }
    }
    for (const d of this.puffs) {
      const s = d.size + d.life * d.grow;
      const fade = Math.min(1, d.life * 2) * (1 - d.life / d.max);
      this.smokeBB.set(n++, d.p.x, d.p.y, d.p.z, s, s, fade * 0.5);
    }
    this.smokeBB.commit(n);
    this.smokeBB.mat.uniforms.uColor.value.copy(this.cloudMat.color).multiplyScalar(0.92);
  }
}
