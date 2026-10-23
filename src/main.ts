import 'vite-plugin-monkey/dist/client';
import { Core } from './core/observer';
import { Settings } from './settings/settings';
import { initSettingsPage } from './settings/panel';
import { defineModule, startModules } from './core/registry';
import { captureCredentials } from './api/mal';
import { safe } from './utils/helpers';

import './modules/fastLoad';
import './modules/tagFilter';
import './modules/shortUrls';
import './modules/banner';
import './modules/nyaa';
import './modules/keyframe';
import './modules/mediaInfo';
import './modules/airingDots';
import './modules/anisongs';
import './modules/tierLabels';
import './modules/compareView';
import './modules/sync';
import './modules/devMode';

defineModule('settings', null, initSettingsPage);

Settings.migrate();
safe(captureCredentials, 'credential capture');
startModules(true);
Core.ready(() => startModules(false));