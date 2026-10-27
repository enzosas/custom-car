// Random.ts
// Reproduz os geradores usados no C++:
//  - std::mt19937 (exato)
//  - std::uniform_real_distribution<float> (generate_canonical em float, igual MSVC/libstdc++)
//  - std::shuffle (variante clássica do MSVC)
//  - rand() do MSVC (LCG, semente 1) usado pelas partículas

const f = Math.fround;

export class Mt19937 {
    private mt = new Uint32Array(624);
    private idx = 624;

    constructor(seed = 5489) { this.seed(seed); }

    seed(s: number) {
        this.mt[0] = s >>> 0;
        for (let i = 1; i < 624; i++) {
            const prev = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
            this.mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
        }
        this.idx = 624;
    }

    private twist() {
        const mt = this.mt;
        for (let i = 0; i < 624; i++) {
            const y = (mt[i] & 0x80000000) | (mt[(i + 1) % 624] & 0x7fffffff);
            let v = mt[(i + 397) % 624] ^ (y >>> 1);
            if (y & 1) v ^= 0x9908b0df;
            mt[i] = v >>> 0;
        }
        this.idx = 0;
    }

    /** próximo inteiro de 32 bits sem sinal */
    next(): number {
        if (this.idx >= 624) this.twist();
        let y = this.mt[this.idx++];
        y ^= y >>> 11;
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= y >>> 18;
        return y >>> 0;
    }
}

/** generate_canonical<float, 24>: (u convertido para float) / 2^32, com clamp em nextbefore(1) */
export function canonicalFloat(rng: Mt19937): number {
    let ans = f(f(rng.next()) / 4294967296);
    if (ans >= 1) ans = 0.99999994;
    return ans;
}

/** std::uniform_real_distribution<float>(a, b)(rng) */
export function uniformReal(rng: Mt19937, a: number, b: number): number {
    a = f(a); b = f(b);
    return f(f(canonicalFloat(rng) * f(b - a)) + a);
}

/** std::shuffle (MSVC) com mt19937 como URBG */
export function shuffle<T>(arr: T[], rng: Mt19937) {
    const n = arr.length;
    for (let i = 1; i < n; i++) {
        const index = i + 1;
        let off = 0;
        for (;;) {
            const ret = rng.next();
            const mask = 0xffffffff;
            if (Math.floor(ret / index) < Math.floor(mask / index) || mask % index === index - 1) {
                off = ret % index;
                break;
            }
        }
        if (off !== i) { const t = arr[i]; arr[i] = arr[off]; arr[off] = t; }
    }
}

/** rand() do MSVC: LCG com semente inicial 1, RAND_MAX = 32767 */
export class MsvcRand {
    private seed = 1;
    static readonly RAND_MAX = 32767;
    next(): number {
        this.seed = (Math.imul(this.seed, 214013) + 2531011) >>> 0;
        return (this.seed >>> 16) & 0x7fff;
    }
    /** float randFloat(min, max) de Particulas.h */
    randFloat(min: number, max: number): number {
        return f(min + f(f(this.next()) / f(f(MsvcRand.RAND_MAX) / f(max - min))));
    }
}

/** semente aleatória de 32 bits (std::random_device) */
export function sementeAleatoria(): number {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] === 0 ? 1 : a[0];
}

/** rand() global compartilhado (no C++ é um único gerador para partículas e para o sorteio de grama) */
export const randGlobal = new MsvcRand();
