/* eslint-disable import/order */
/* eslint-disable import/no-duplicates */
import {Scope} from './Scope'
import {createG} from './lib/globals'
import {operators} from './operators'
import {Table} from './Table'
import {LuaError} from './LuaError'
import {libMath} from './lib/math'
import {libTable} from './lib/table'
import {libString, metatable as stringMetatable} from './lib/string'
import {getLibOS} from './lib/os'
import {getLibPackage} from './lib/package'
import {LuaType, ensureArray, Config} from './utils'
import {parse as parseScript} from './parser'

interface Script {
    exec: () => Promise<LuaType>
}

const call = async (f: Function | Table, ...args: LuaType[]): Promise<LuaType[]> => {
    if (f instanceof Function) return ensureArray(await f(...args))

    const mm = f instanceof Table && await f.getMetaMethod('__call')
    if (mm) return ensureArray(await mm(f, ...args))

    throw new LuaError(`attempt to call an uncallable type`)
}

const stringTable = new Table()
stringTable.metatable = stringMetatable

const get = async (t: Table | string, v: LuaType): Promise<LuaType> => {
    if (t instanceof Table) return await t.get(v)
    if (typeof t === 'string') return await stringTable.get(v)

    throw new LuaError(`no table or metatable found for given type`)
}

const execChunk = async (_G: Table, chunk: string, chunkName?: string): Promise<LuaType[]> => {
    // console.log('\n\n\n\n=================\n', chunk, '\n=================\n\n\n\n')
    const exec = new Function('__lua', chunk)
    const globalScope = new Scope(_G.strValues).extend()
    if (chunkName) globalScope.setVarargs([chunkName])
    const asyncFn = exec({
        globalScope,
        ...operators,
        Table,
        call,
        get
    }) as () => Promise<LuaType[]>
    const res = await asyncFn()
    return res === undefined ? [undefined] : res
}

async function createEnv(
    config: Config = {}
): Promise<{
    parse: (script: string) => Script
    parseFile: (path: string) => Promise<Script>
    loadLib: (name: string, value: Table) => Promise<void>
}> {
    const cfg: Config = {
        LUA_PATH: './?.lua',
        stdin: '',
        stdout: console.log,
        ...config
    }

    const _G = await createG(cfg, execChunk)

    const {libPackage, _require} = getLibPackage(
        async (content, moduleName) => (await execChunk(_G, parseScript(content), moduleName))[0],
        cfg
    )
    const loaded = await libPackage.get('loaded') as Table

    const loadLib = async (name: string, value: Table): Promise<void> => {
        await _G.rawset(name, value)
        await loaded.rawset(name, value)
    }

    await loadLib('_G', _G)
    await loadLib('package', libPackage)
    await loadLib('math', libMath)
    await loadLib('table', libTable)
    await loadLib('string', libString)
    await loadLib('os', getLibOS(cfg))

    await _G.rawset('require', _require)

    const parse = (code: string): Script => {
        const script = parseScript(code)
        return {
            exec: async () => (await execChunk(_G, script))[0]
        }
    }

    const parseFile = async (filename: string): Promise<Script> => {
        if (!cfg.fileExists) throw new LuaError('parseFile requires the config.fileExists function')
        if (!cfg.loadFile) throw new LuaError('parseFile requires the config.loadFile function')

        if (!cfg.fileExists(filename)) throw new LuaError('file not found')

        return parse(await cfg.loadFile(filename))
    }

    return {
        parse,
        parseFile,
        loadLib
    }
}

// eslint-disable-next-line import/first
import * as utils from './utils'

export {createEnv, Table, LuaError, utils}
