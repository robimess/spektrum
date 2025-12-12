let wasm;

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

let cachedFloat32ArrayMemory0 = null;

function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let WASM_VECTOR_LEN = 0;

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

const WasmSpectrogramFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmspectrogram_free(ptr >>> 0, 1));

export class WasmSpectrogram {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSpectrogramFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmspectrogram_free(ptr, 0);
    }
    /**
     * @param {WasmSpectrogramConfig} cfg
     */
    constructor(cfg) {
        _assertClass(cfg, WasmSpectrogramConfig);
        var ptr0 = cfg.__destroy_into_raw();
        const ret = wasm.wasmspectrogram_new(ptr0);
        this.__wbg_ptr = ret >>> 0;
        WasmSpectrogramFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {Float32Array} input
     * @returns {Float32Array | undefined}
     */
    process(input) {
        const ptr0 = passArrayF32ToWasm0(input, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmspectrogram_process(this.__wbg_ptr, ptr0, len0);
        let v2;
        if (ret[0] !== 0) {
            v2 = getArrayF32FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        }
        return v2;
    }
    /**
     * @returns {number}
     */
    get bins_out() {
        const ret = wasm.wasmspectrogram_bins_out(this.__wbg_ptr);
        return ret >>> 0;
    }
}

const WasmSpectrogramConfigFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmspectrogramconfig_free(ptr >>> 0, 1));

export class WasmSpectrogramConfig {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSpectrogramConfigFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmspectrogramconfig_free(ptr, 0);
    }
    constructor() {
        const ret = wasm.wasmspectrogramconfig_new();
        this.__wbg_ptr = ret >>> 0;
        WasmSpectrogramConfigFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {number}
     */
    get sample_rate() {
        const ret = wasm.wasmspectrogramconfig_sample_rate(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} v
     */
    set sample_rate(v) {
        wasm.wasmspectrogramconfig_set_sample_rate(this.__wbg_ptr, v);
    }
    /**
     * @returns {number}
     */
    get fft_size() {
        const ret = wasm.wasmspectrogramconfig_fft_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} v
     */
    set fft_size(v) {
        wasm.wasmspectrogramconfig_set_fft_size(this.__wbg_ptr, v);
    }
    /**
     * @returns {number}
     */
    get hop_size() {
        const ret = wasm.wasmspectrogramconfig_hop_size(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} v
     */
    set hop_size(v) {
        wasm.wasmspectrogramconfig_set_hop_size(this.__wbg_ptr, v);
    }
    /**
     * @returns {number}
     */
    get ref_power() {
        const ret = wasm.wasmspectrogramconfig_ref_power(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} v
     */
    set ref_power(v) {
        wasm.wasmspectrogramconfig_set_ref_power(this.__wbg_ptr, v);
    }
    /**
     * @returns {number}
     */
    get min_db() {
        const ret = wasm.wasmspectrogramconfig_min_db(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} v
     */
    set min_db(v) {
        wasm.wasmspectrogramconfig_set_min_db(this.__wbg_ptr, v);
    }
    /**
     * @returns {number}
     */
    get max_db() {
        const ret = wasm.wasmspectrogramconfig_max_db(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} v
     */
    set max_db(v) {
        wasm.wasmspectrogramconfig_set_max_db(this.__wbg_ptr, v);
    }
    /**
     * @returns {number}
     */
    get bins_out() {
        const ret = wasm.wasmspectrogramconfig_bins_out(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} v
     */
    set bins_out(v) {
        wasm.wasmspectrogramconfig_set_bins_out(this.__wbg_ptr, v);
    }
    /**
     * @returns {number}
     */
    get window_kind() {
        const ret = wasm.wasmspectrogramconfig_window_kind(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} v
     */
    set window_kind(v) {
        wasm.wasmspectrogramconfig_set_window_kind(this.__wbg_ptr, v);
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_0;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('spektrum_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
