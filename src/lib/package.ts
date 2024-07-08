import {Table} from '../Table'
import {LuaType, Config, coerceArgToString} from '../utils'
import {LuaError} from '../LuaError'

const getLibPackage = (
    execModule: (content: string, moduleName: string) => Promise<LuaType>,
    cfg: Config
): {
    libPackage: Table
    _require: (modname: LuaType) => Promise<LuaType>
} => {
    const LUA_DIRSEP = '/'
    const LUA_PATH_SEP = ';'
    const LUA_PATH_MARK = '?'
    const LUA_EXEC_DIR = '!'
    const LUA_IGMARK = '-'

    const LUA_PATH = cfg.LUA_PATH

    const config = [LUA_DIRSEP, LUA_PATH_SEP, LUA_PATH_MARK, LUA_EXEC_DIR, LUA_IGMARK].join('\n')

    const loaded = new Table()
    const preload = new Table()

    const searchpath = async (name: LuaType, path: LuaType, sep?: LuaType, rep?: LuaType): Promise<string | [undefined, string]> => {
        if (!cfg.fileExists) {
            throw new LuaError('package.searchpath requires the config.fileExists function')
        }

        let NAME = coerceArgToString(name, 'searchpath', 1)
        const PATH = coerceArgToString(path, 'searchpath', 2)
        const SEP = sep === undefined ? '.' : coerceArgToString(sep, 'searchpath', 3)
        const REP = rep === undefined ? '/' : coerceArgToString(rep, 'searchpath', 4)

        NAME = NAME.replace(SEP, REP)

        const paths = PATH.split(';').map(template => template.replace('?', NAME))

        for (const path of paths) {
            if (await cfg.fileExists(path)) return path
        }

        return [undefined, `The following files don't exist: ${paths.join(' ')}`]
    }

    const searchers = new Table([
        async (moduleName: string): Promise<[undefined] | [() => LuaType]> => {
            const res = await preload.rawget(moduleName)
            if (res === undefined) {
                return [undefined]
            }
            return [res as () => LuaType]
        },
        async (moduleName: string): Promise<[undefined] | [string] | [(modname: string, path: string) => Promise<LuaType>, string]> => {
            const res = await searchpath(moduleName, await libPackage.rawget('path'))
            if (Array.isArray(res) && res[0] === undefined) {
                return [res[1]]
            }

            if (!cfg.loadFile) {
                throw new LuaError('package.searchers requires the config.loadFile function')
            }

            return [async (moduleName: string, path: string) => execModule(await cfg.loadFile(path), moduleName), res as string]
        }
    ])

    async function _require(modname: LuaType): Promise<LuaType> {
        const MODNAME = coerceArgToString(modname, 'require', 1)

        const module = await loaded.rawget(MODNAME)
        if (module) return module

        const searcherFns = searchers.numValues.filter(fn => !!fn) as Function[]

        for (const searcher of searcherFns) {
            const res = await searcher(MODNAME)
            if (res[0] !== undefined && typeof res[0] !== 'string') {
                const loader = res[0]
                const result = await loader(MODNAME, res[1])
                const module = result === undefined ? true : result
                await loaded.rawset(MODNAME, module)
                return module
            }
        }

        throw new LuaError(`Module '${MODNAME}' not found!`)
    }

    const libPackage = new Table({
        path: LUA_PATH,
        config,
        loaded,
        preload,
        searchers,
        searchpath
    })

    return {libPackage, _require}
}

export {getLibPackage}
