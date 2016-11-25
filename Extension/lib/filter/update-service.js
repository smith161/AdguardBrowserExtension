/**
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Adguard Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Service that manages extension version information and handles
 * extension update. For instance we may need to change storage schema on update.
 */
var ApplicationUpdateService = {

    /**
     * Returns extension run info
     * @returns {{isFirstRun: boolean, isUpdate: (boolean|*), currentVersion: (Prefs.version|*), prevVersion: *}}
     */
    getRunInfo: function () {

        var currentVersion = adguard.app.getVersion();
        var prevVersion = adguard.utils.browser.getAppVersion();
        adguard.utils.browser.setAppVersion(currentVersion);

        var isFirstRun = currentVersion !== prevVersion && !prevVersion;
        var isUpdate = currentVersion !== prevVersion && prevVersion;

        return {
            isFirstRun: isFirstRun,
            isUpdate: isUpdate,
            currentVersion: currentVersion,
            prevVersion: prevVersion
        };
    },

    /**
     * Handle extension update
     * @param runInfo   Run info
     * @param callback  Called after update was handled
     */
    onUpdate: function (runInfo, callback) {

        var methods = [];
        if (adguard.utils.browser.isGreaterVersion("1.0.1.0", runInfo.prevVersion)) {
            methods.push(this._onUpdateToSaveFilterRulesToDifferentFiles);
        }
        if (adguard.utils.browser.isGreaterVersion("1.0.3.0", runInfo.prevVersion)) {
            methods.push(this._onUpdateToMultiplySubscriptions);
        }
        if (adguard.utils.browser.isGreaterVersion("2.0.0", runInfo.prevVersion)) {
            methods.push(this._onUpdateRemoveIpResolver);
        }
        if (adguard.utils.browser.isGreaterVersion("2.0.9", runInfo.prevVersion)) {
            methods.push(this._onUpdateWhiteListService);
        }
        if (adguard.utils.browser.isGreaterVersion("2.0.10", runInfo.prevVersion)) {
            methods.push(this._onUpdateRuleHitStats);
        }
        if (adguard.utils.browser.isGreaterVersion("2.1.2", runInfo.prevVersion) && adguard.utils.browser.isFirefoxBrowser()) {
            methods.push(this._onUpdateFirefoxStorage);
        }
        if (adguard.utils.browser.isGreaterVersion("2.3.5", runInfo.prevVersion) && adguard.utils.browser.isChromium() && !adguard.utils.browser.isSafariBrowser()) {
            methods.push(this._onUpdateChromiumStorage);
        }

        var dfd = this._executeMethods(methods);
        dfd.then(callback);
    },

    /**
     * Helper to execute deferred objects
     *
     * @param methods Methods to execute
     * @returns {Deferred}
     * @private
     */
    _executeMethods: function (methods) {

        var mainDfd = new Promise();

        var executeNextMethod = function () {
            if (methods.length == 0) {
                mainDfd.resolve();
            } else {
                var method = methods.shift();
                var dfd = method.call(this);
                dfd.then(executeNextMethod);
            }
        }.bind(this);

        executeNextMethod();

        return mainDfd;
    },

    /**
     * Earlier filters rules were saved to filters.ini.
     * Now filters rules save to filter_1.txt, filter_2.txt, ...
     * @private
     */
    _onUpdateToSaveFilterRulesToDifferentFiles: function () {

        Log.info('Call update to version 1.0.1.0');

        var updateDfd = new Promise();

        adguard.rulesStorage.read(function (filters) {

            var adguardFilters = Object.create(null);

            var processNextFilter = function () {
                if (filters.length === 0) {
                    //update adguard-filters in local storage for next update iteration
                    adguard.localStorage.setItem('adguard-filters', JSON.stringify(adguardFilters));

                    //cleanup old file
                    var removeCallback = function () {
                        // Ignore
                    };
                    adguard.rulesStorageImpl.remove(FileStorage.FILE_PATH, removeCallback, removeCallback);
                    updateDfd.resolve();
                } else {
                    var filter = filters.shift();
                    adguardFilters[filter.filterId] = {
                        version: filter.version,
                        lastCheckTime: filter.lastCheckTime,
                        lastUpdateTime: filter.lastUpdateTime,
                        disabled: filter.disabled
                    };
                    var dfd = new Promise();
                    var rulesText = adguard.utils.collections.getRulesText(filter.filterRules);
                    adguard.rulesStorage.write(filter.filterId, rulesText, dfd.resolve);
                    dfd.then(processNextFilter);
                }
            };

            processNextFilter();
        });

        return updateDfd;
    },

    /**
     * Update to version with filter subscriptions
     *
     * version 1.0.3.0
     * @private
     */
    _onUpdateToMultiplySubscriptions: function () {

        Log.info('Call update to version 1.0.3.0');

        if (adguard.localStorage.hasItem('adguard-filters')) {
            this._saveInstalledFiltersOnUpdate();
            this._saveFiltersVersionInfoOnUpdate();
            adguard.localStorage.removeItem('adguard-filters');
        }

        var dfd = new Promise();
        dfd.resolve();
        return dfd;
    },

    /**
     * Update to version without ip-resolve
     *
     * version 2.0.0
     * @private
     */
    _onUpdateRemoveIpResolver: function () {

        Log.info('Call update to version 1.0.3.0');

        adguard.localStorage.removeItem('ip-cache');

        var dfd = new Promise();
        dfd.resolve();
        return dfd;
    },

    /**
     * Update whitelist service
     *
     * Version 2.0.9
     * @private
     */
    _onUpdateWhiteListService: function () {

        Log.info('Call update to version 2.0.9');

        var dfd = new Promise();

        var filterId = adguard.utils.filters.WHITE_LIST_FILTER_ID;

        adguard.rulesStorage.read(filterId, function (rulesText) {

            var whiteListDomains = [];

            if (!rulesText) {
                dfd.resolve();
                return;
            }

            for (var i = 0; i < rulesText.length; i++) {
                if (/^@@\/\/([^\/]+)\^\$document$/.test(rulesText[i])) {
                    var domain = RegExp.$1;
                    if (whiteListDomains.indexOf(domain) < 0) {
                        whiteListDomains.push(domain);
                    }
                }
            }

            adguard.localStorage.setItem('white-list-domains', JSON.stringify(whiteListDomains));

            dfd.resolve();
        }.bind(this));

        return dfd;
    },

    /**
     * Update rule hit stats
     *
     * Version 2.0.10
     * @private
     */
    _onUpdateRuleHitStats: function () {

        adguard.hitStats.cleanup();

        var dfd = new Promise();
        dfd.resolve();
        return dfd;
    },

    /**
     * Update Firefox storage by moving to prefs
     *
     * Version 2.1.2
     * @returns {Promise}
     * @private
     */
    _onUpdateFirefoxStorage: function () {

        Log.info('Call update to version 2.1.2');

        var dfd = new Promise();

        // TODO: It doesn't make sense to support simple-storage only for update

        //var ss = simpleStorage.storage;
        //for (var k in ss) {
        //    if (ss.hasOwnProperty(k)) {
        //        var v = ss[k];
        //        adguard.localStorage.setItem(k, v);
        //        delete ss[k];
        //    }
        //}

        dfd.resolve();
        return dfd;
    },

    /**
     * Updates filters storage - move from files to the storage API.
     *
     * Version 2.3.5
     * @returns {Promise}
     * @private
     */
    _onUpdateChromiumStorage: function () {
        Log.info('Call update to version 2.3.5');

        var dfd = new Promise();

        var filterId = adguard.utils.filters.USER_FILTER_ID;
        var filePath = "filterrules_" + filterId + ".txt";

        FileStorage.readFromFile(filePath, function (e, rules) {
            if (e) {
                Log.error("Error while reading rules from file {0} cause: {1}", filePath, e);
                return;
            }

            var onTransferCompleted = function () {
                Log.info("Rules have been transferred to local storage for filter {0}", filterId);

                FileStorage.removeFile(filePath, function () {
                    Log.info("File removed for filter {0}", filterId);
                }, function () {
                    Log.error("File remove error for filter {0}", filterId);
                });
            };

            if (rules) {
                Log.info('Found rules:' + rules.length);
            }

            adguard.rulesStorage.write(filterId, rules, onTransferCompleted.bind(this));
        }.bind(this));

        dfd.resolve();
        return dfd;
    },

    /**
     * Mark 'adguard-filters' as installed and loaded on extension version update
     * @private
     */
    _saveInstalledFiltersOnUpdate: function () {

        var adguardFilters = JSON.parse(adguard.localStorage.getItem('adguard-filters')) || Object.create(null);

        for (var filterId in adguardFilters) {
            var filterInfo = adguardFilters[filterId];
            if (filterId == adguard.utils.filters.USER_FILTER_ID || filterId == adguard.utils.filters.WHITE_LIST_FILTER_ID) {
                continue;
            }
            var filter = {
                filterId: filterId,
                loaded: true
            };
            if (!filterInfo.disabled) {
                filter.installed = true;
                filter.enabled = true;
            }
            if (filterId == adguard.utils.filters.SEARCH_AND_SELF_PROMO_FILTER_ID) {
                filter.installed = true;
            }
            FilterLSUtils.updateFilterStateInfo(filter);
        }
    },

    /**
     * Update 'adguard-filters' version and last check and update time
     * @private
     */
    _saveFiltersVersionInfoOnUpdate: function () {

        var adguardFilters = JSON.parse(adguard.localStorage.getItem('adguard-filters')) || Object.create(null);

        for (var filterId in adguardFilters) {
            var filterInfo = adguardFilters[filterId];
            var filter = {
                filterId: filterId,
                version: filterInfo.version,
                lastCheckTime: filterInfo.lastCheckTime,
                lastUpdateTime: filterInfo.lastUpdateTime
            };
            FilterLSUtils.updateFilterVersionInfo(filter);
        }
    }
};

/**
 * File storage adapter
 * @Deprecated Used now only to upgrade from versions older than v2.3.5
 */
var FileStorage = {

    LINE_BREAK: '\n',
    FILE_PATH: "filters.ini",

    readFromFile: function (path, callback) {

        var successCallback = function (fs, fileEntry) {

            fileEntry.file(function (file) {

                var reader = new FileReader();
                reader.onloadend = function () {

                    if (reader.error) {
                        callback(reader.error);
                    } else {
                        var lines = [];
                        if (reader.result) {
                            lines = reader.result.split(/[\r\n]+/);
                        }
                        callback(null, lines);
                    }
                };

                reader.onerror = function (e) {
                    callback(e);
                };

                reader.readAsText(file);

            }, callback);
        };

        this._getFile(path, true, successCallback, callback);
    },

    _getFile: function (path, create, successCallback, errorCallback) {

        path = path.replace(/^.*[\/\\]/, "");

        var requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
        requestFileSystem(window.PERSISTENT, 1024 * 1024 * 1024, function (fs) {
            fs.root.getFile(path, {create: create}, function (fileEntry) {
                successCallback(fs, fileEntry);
            }, errorCallback);
        }, errorCallback);
    },

    removeFile: function (path, successCallback, errorCallback) {
        this._getFile(path, false, function (fs, fileEntry) {
            fileEntry.remove(successCallback, errorCallback);
        }, errorCallback);
    }
};



