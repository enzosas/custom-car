// vec.ts - operações básicas de vetor 3D (objetos imutáveis {x,y,z}).
import { type V3, mix } from './Mat4';

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const add = (a: V3, b: V3) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: V3, b: V3) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a: V3, s: number) => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
export const cross = (a: V3, b: V3) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const norm = (a: V3) => { const l = len(a) || 1; return v3(a.x / l, a.y / l, a.z / l); };
export const mixV = (a: V3, b: V3, t: number) => v3(mix(a.x, b.x, t), mix(a.y, b.y, t), mix(a.z, b.z, t));
