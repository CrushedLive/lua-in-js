import {hasOwnProperty, LuaType, tostring} from './utils'

type MetaMethods =
// unary op
    | '__unm'
    | '__bnot'
    | '__len'
    // binary op
    | '__add'
    | '__sub'
    | '__mul'
    | '__mod'
    | '__pow'
    | '__div'
    | '__idiv'
    | '__band'
    | '__bor'
    | '__bxor'
    | '__shl'
    | '__shr'
    | '__concat'
    | '__eq'
    | '__lt'
    | '__le'
    // other
    | '__index'
    | '__newindex'
    | '__call'
    | '__pairs'
    | '__ipairs'
    | '__tostring'

class Table {
    public numValues: LuaType[] = [undefined]
    public strValues: Record<string, LuaType> = {}
    public keys: string[] = []
    public values: LuaType[] = []
    public metatable: Table | null = null

    public constructor(initialiser?: Record<string, LuaType> | LuaType[]) {
        if (Array.isArray(initialiser)) {
            this.insert(...initialiser)
            return
        }

        for (const key in initialiser) {
            if (hasOwnProperty(initialiser, key)) {
                let value = initialiser[key]
                if (value === null) value = undefined
                this._rawset(key, value)
            }
        }
    }

    public static async from(initialiser?: Record<string, LuaType> | LuaType[] | ((t: Table) => void)): Promise<Table> {
        const instance = new Table()
        if (initialiser === undefined) return instance

        if (typeof initialiser === 'function') {
            await initialiser(instance)
            return instance
        }

        if (Array.isArray(initialiser)) {
            instance.insert(...initialiser)
            return instance
        }

        for (const key in initialiser) {
            if (hasOwnProperty(initialiser, key)) {
                let value = initialiser[key]
                if (value === null) value = undefined
                await instance.rawset(key, value)
            }
        }
        return instance
    }

    public async get(key: LuaType): Promise<LuaType> {
        const value = await this.rawget(key)

        if (value === undefined && this.metatable) {
            const mm = await this.metatable.get('__index') as Table | Function

            if (mm instanceof Table) {
                return await mm.get(key)
            }

            if (typeof mm === 'function') {
                const v = await mm.call(undefined, this, key)
                return v instanceof Array ? v[0] : v
            }
        }

        return value
    }

    public async rawget(key: LuaType): Promise<LuaType> {
        switch (typeof key) {
            case 'string':
                if (hasOwnProperty(this.strValues, key)) {
                    return this.strValues[key]
                }
                break
            case 'number':
                if (key > 0 && key % 1 === 0) {
                    return this.numValues[key]
                }
        }

        const index = this.keys.indexOf(await tostring(key))
        return index === -1 ? undefined : this.values[index]
    }

    public async getMetaMethod(name: MetaMethods): Promise<Function> {
        return this.metatable && await (this.metatable.rawget(name) as Promise<Function>)
    }

    public async set(key: LuaType, value: LuaType): Promise<LuaType> {
        const mm = this.metatable && await this.metatable.get('__newindex')
        if (mm) {
            const oldValue = await this.rawget(key)

            if (oldValue === undefined) {
                if (mm instanceof Table) {
                    return await mm.set(key, value)
                }
                if (typeof mm === 'function') {
                    return await mm(this, key, value)
                }
            }
        }

        await this.rawset(key, value)
    }

    public setFn(key: string): (v: LuaType) => Promise<LuaType> {
        return v => this.set(key, v)
    }

    private _rawset(key: LuaType, value: LuaType) {
        switch (typeof key) {
            case 'string':
                this.strValues[key] = value
                return

            case 'number':
                if (key > 0 && key % 1 === 0) {
                    this.numValues[key] = value
                    return
                }
        }
    }

    public async rawset(key: LuaType, value: LuaType): Promise<void> {
        switch (typeof key) {
            case 'string':
                this.strValues[key] = value
                return

            case 'number':
                if (key > 0 && key % 1 === 0) {
                    this.numValues[key] = value
                    return
                }
        }

        const K = await tostring(key)
        const index = this.keys.indexOf(K)
        if (index > -1) {
            this.values[index] = value
            return
        }

        this.values[this.keys.length] = value
        this.keys.push(K)
    }

    public insert(...values: LuaType[]): void {
        this.numValues.push(...values)
    }

    public toObject(): unknown[] | Record<string, unknown> {
        const outputAsArray = Object.keys(this.strValues).length === 0 && this.getn() > 0
        const result: unknown[] | Record<string, unknown> = outputAsArray ? [] : {}

        for (let i = 1; i < this.numValues.length; i++) {
            const propValue = this.numValues[i]
            const value = propValue instanceof Table ? propValue.toObject() : propValue

            if (outputAsArray) {
                const res = result as unknown[]
                res[i - 1] = value
            } else {
                const res = result as Record<string, unknown>
                res[String(i - 1)] = value
            }
        }

        for (const key in this.strValues) {
            if (hasOwnProperty(this.strValues, key)) {
                const propValue = this.strValues[key]
                const value = propValue instanceof Table ? propValue.toObject() : propValue

                const res = result as Record<string, unknown>
                res[key] = value
            }
        }

        return result
    }

    public getn(): number {
        const vals = this.numValues
        const keys: boolean[] = []

        for (const i in vals) {
            if (hasOwnProperty(vals, i)) {
                keys[i] = true
            }
        }

        let j = 0
        while (keys[j + 1]) {
            j += 1
        }

        // Following translated from ltable.c (http://www.lua.org/source/5.3/ltable.c.html)
        if (j > 0 && vals[j] === undefined) {
            /* there is a boundary in the array part: (binary) search for it */
            let i = 0

            while (j - i > 1) {
                const m = Math.floor((i + j) / 2)

                if (vals[m] === undefined) {
                    j = m
                } else {
                    i = m
                }
            }

            return i
        }

        return j
    }
}

export {MetaMethods, Table}
