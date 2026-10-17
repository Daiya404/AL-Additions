import pkg from './package.json' with { type: 'json' };
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'AL Additions',
        namespace: 'daiya.al-additions-v3',
        version: pkg.version,
        description: pkg.description,
        author: pkg.author,
        homepageURL: 'https://github.com/Daiya404/AL-Additions',
        icon: 'https://anilist.co/img/icons/favicon-32x32.png',
        match: [
            'https://anilist.co/*',
            'https://myanimelist.net/*'
        ],
        grant: [
            'GM_getValue',
            'GM_setValue',
            'GM_registerMenuCommand',
            'GM_deleteValue',
            'GM_xmlhttpRequest',
            'GM_download',
            'unsafeWindow'
        ],
        connect: [
            'graphql.anilist.co',
            'myanimelist.net',
            'api.myanimelist.net',
            'api.animethemes.moe',
            'api.mangaupdates.com',
            'www.mangaupdates.com',
            'www.novelupdates.com',
            's4.anilist.co'
        ],
        'run-at': 'document-start',
        noframes: true,
        license: 'GPL-3.0-or-later',
        downloadURL: 'https://raw.githubusercontent.com/Daiya404/AL-Additions/main/al-additions.user.js',
        updateURL: 'https://raw.githubusercontent.com/Daiya404/AL-Additions/main/al-additions.user.js'
        }
    })
  ]
});