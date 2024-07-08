const fs = require('fs')
const path = require('path')
const luainjs = require('..')

const starlight = async () => {
    console.debug('---- STARLIGHT ----')
    const rootPath = './tests/starlight/'
    const luaEnv = await luainjs.createEnv({
        fileExists: p => fs.existsSync(path.join(rootPath, p)),
        loadFile: p => fs.readFileSync(path.join(rootPath, p), {encoding: 'utf8'}),
        osExit: code => code && process.exit(code)
    })
    console.log(await (await luaEnv.parseFile('test-runner.lua')).exec())
    console.debug('---- /STARLIGHT ----')
}

// TODO: make more official lua 5.3 tests pass (most of them don't pass because they `require "debug"`)
const fivethree = async () => {
    console.debug('---- FIVETHREE ----')
    const rootPath = './tests/lua-5.3/'
    const luaEnv = await luainjs.createEnv({
        fileExists: p => fs.existsSync(path.join(rootPath, p)),
        loadFile: p => fs.readFileSync(path.join(rootPath, p), {encoding: 'utf8'}),
        osExit: code => process.exit(code)
    })
    console.log(await (await luaEnv.parseFile('goto.lua')).exec())
    console.log(await (await luaEnv.parseFile('bwcoercion.lua')).exec())
    console.debug('---- /FIVETHREE ----')
}

const inline = async () => {
    console.debug('---- INLINE ----')
    const luaEnv = await luainjs.createEnv()

    function helloBuilder(name) {
        const NAME = luainjs.utils.coerceArgToString(name, 'sayHi', 1)
        return `Hello ${NAME}!`
    }

    const myLib = new luainjs.Table({helloBuilder})
    await luaEnv.loadLib('myLib', myLib)
    const str = await luaEnv.parse(`return myLib.helloBuilder('John')`).exec()
    if (str !== 'Hello John!') {
        throw Error("Strings don't match!")
    }
    console.debug('---- /INLINE ----')
}

const backticks = async () => {
    console.debug('---- BACKTICKS ----')
    const luaEnv = await luainjs.createEnv()
    let str
    try {
        str = await luaEnv.parse('return "Backtick `literals` in strings work"').exec()
    } catch (e) {
        throw Error('Backticks in strings transpile into invalid code!')
    }
    if (str !== 'Backtick `literals` in strings work') {
        throw Error('Backticks in strings transpile incorrectly!')
    }
}

(async () => {
    try {
        await starlight()
        await fivethree()
        await inline()
        await backticks()
    } catch (e) {
        console.error(e)
    }
})()