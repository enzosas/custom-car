// Mat4.ts — subconjunto de glm (mat4 coluna-maior) usado pelo jogo.
// Layout idêntico ao glm e ao THREE.Matrix4.elements: m[coluna * 4 + linha].

export type V3 = { x: number; y: number; z: number };

export class Mat4 {
    m: number[];
    constructor(m?: number[]) {
        this.m = m ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    }
    clone() { return new Mat4(this.m.slice()); }

    /** this * b */
    mul(b: Mat4): Mat4 {
        const a = this.m, r = new Array<number>(16);
        for (let c = 0; c < 4; c++) {
            for (let row = 0; row < 4; row++) {
                let s = 0;
                for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b.m[c * 4 + k];
                r[c * 4 + row] = s;
            }
        }
        return new Mat4(r);
    }

    /** glm::translate(m, v) */
    translate(v: V3): Mat4 {
        const r = this.m.slice();
        for (let row = 0; row < 4; row++) {
            r[12 + row] = this.m[row] * v.x + this.m[4 + row] * v.y + this.m[8 + row] * v.z + this.m[12 + row];
        }
        return new Mat4(r);
    }

    /** glm::scale(m, v) */
    scale(v: V3): Mat4 {
        const r = this.m.slice();
        for (let row = 0; row < 4; row++) {
            r[row] = this.m[row] * v.x;
            r[4 + row] = this.m[4 + row] * v.y;
            r[8 + row] = this.m[8 + row] * v.z;
        }
        return new Mat4(r);
    }

    /** glm::rotate(m, angleRad, axis) */
    rotate(angle: number, axis: V3): Mat4 {
        const c = Math.cos(angle), s = Math.sin(angle);
        const len = Math.hypot(axis.x, axis.y, axis.z) || 1;
        const ax = axis.x / len, ay = axis.y / len, az = axis.z / len;
        const tx = (1 - c) * ax, ty = (1 - c) * ay, tz = (1 - c) * az;
        const R = new Mat4([
            c + tx * ax, tx * ay + s * az, tx * az - s * ay, 0,
            ty * ax - s * az, c + ty * ay, ty * az + s * ax, 0,
            tz * ax + s * ay, tz * ay - s * ax, c + tz * az, 0,
            0, 0, 0, 1,
        ]);
        return this.mul(R);
    }

    /** m * vec4(p, w) -> xyz */
    transform(p: V3, w = 1): V3 {
        const m = this.m;
        return {
            x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12] * w,
            y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13] * w,
            z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14] * w,
        };
    }

    static translation(v: V3) { return new Mat4().translate(v); }
}

export const X_AXIS: V3 = { x: 1, y: 0, z: 0 };
export const Y_AXIS: V3 = { x: 0, y: 1, z: 0 };
export const Z_AXIS: V3 = { x: 0, y: 0, z: 1 };

export const radians = (d: number) => d * Math.PI / 180;
export const degrees = (r: number) => r * 180 / Math.PI;
export const clamp = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
export const smoothstep = (e0: number, e1: number, x: number) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
};
