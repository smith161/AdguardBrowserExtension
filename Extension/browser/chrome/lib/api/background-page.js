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

/* global chrome, RequestTypes */

(function (adguard) {

    'use strict';

    var browser = browser || chrome;

    adguard.runtime = (function () {

        var onMessage = {
            addListener: function (callback) {
                // https://developer.chrome.com/extensions/runtime#event-onMessage
                adguard.runtimeImpl.onMessage.addListener(function (message, sender, sendResponse) {
                    var senderOverride = Object.create(null);
                    if (sender.tab) {
                        senderOverride.tab = adguard.tabsImpl.fromChromeTab(sender.tab);
                    }
                    var response = callback(message, senderOverride, sendResponse);
                    var async = response === true;
                    // If async sendResponse will be invoked later
                    if (!async) {
                        sendResponse(response);
                    }
                    // Don't forget return callback result for asynchronous message passing
                    return async;
                });
            }
        };

        return {
            onMessage: onMessage
        };
    })();

    var linkHelper = document.createElement('a');

    /**
     * Fixing request type:
     * https://code.google.com/p/chromium/issues/detail?id=410382
     *
     * @param url Request url
     * @returns String Fixed object type
     */
    function parseRequestTypeFromUrl(url) {
        linkHelper.href = url;
        var path = linkHelper.pathname;
        var requestType = adguard.utils.browser.parseContentTypeFromUrlPath(path);
        if (requestType === null) {
            // https://code.google.com/p/chromium/issues/detail?id=410382
            requestType = RequestTypes.OBJECT;
        }
        return requestType;
    }

    function getRequestDetails(details) {

        var tab = {tabId: details.tabId};

        //https://developer.chrome.com/extensions/webRequest#event-onBeforeRequest
        var requestDetails = {
            requestUrl: details.url,    //request url
            tab: tab                    //request tab
        };

        var frameId = 0;        //id of this frame (only for main_frame and sub_frame types)
        var requestFrameId = 0; //id of frame where request is executed
        var requestType;        //request type

        switch (details.type) {
            case "main_frame":
                frameId = 0;
                requestType = RequestTypes.DOCUMENT;
                break;
            case "sub_frame":
                frameId = details.frameId;
                requestFrameId = details.parentFrameId; //for sub_frame use parentFrameId as id of frame that wraps this frame
                requestType = RequestTypes.SUBDOCUMENT;
                break;
            default:
                requestFrameId = details.frameId;
                requestType = details.type.toUpperCase();
                break;
        }

        //relate request to main_frame
        if (requestFrameId === -1) {
            requestFrameId = 0;
        }

        if (requestType === RequestTypes.OTHER) {
            requestType = parseRequestTypeFromUrl(details.url);
        }

        requestDetails.frameId = frameId;
        requestDetails.requestFrameId = requestFrameId;
        requestDetails.requestType = requestType;

        if (details.requestHeaders) {
            requestDetails.requestHeaders = details.requestHeaders;
        }

        if (details.responseHeaders) {
            requestDetails.responseHeaders = details.responseHeaders;
        }

        return requestDetails;
    }

    var onBeforeRequest = {

        addListener: function (callback, urls) {

            // https://developer.chrome.com/extensions/webRequest#event-onBeforeRequest
            browser.webRequest.onBeforeRequest.addListener(function (details) {

                if (details.tabId === -1) {
                    return;
                }

                var requestDetails = getRequestDetails(details);
                var skip = callback(requestDetails);
                return {
                    cancel: skip === false
                };

            }, urls ? {urls: urls} : {}, ["blocking"]);
        }
    };

    var onHeadersReceived = {

        addListener: function (callback, urls) {

            browser.webRequest.onHeadersReceived.addListener(function (details) {

                if (details.tabId === -1) {
                    return;
                }

                var requestDetails = getRequestDetails(details);
                var result = callback(requestDetails);
                if (result) {
                    return 'responseHeaders' in result ? {responseHeaders: result.responseHeaders} : {};
                }

            }, urls ? {urls: urls} : {}, ["responseHeaders", "blocking"]);
        }
    };

    var onBeforeSendHeaders = {

        addListener: function (callback, urls) {

            browser.webRequest.onBeforeSendHeaders.addListener(function (details) {

                if (details.tabId === -1) {
                    return;
                }

                var requestDetails = getRequestDetails(details);
                var result = callback(requestDetails);
                if (result) {
                    return 'requestHeaders' in result ? {requestHeaders: result.requestHeaders} : {};
                }

            }, urls ? {urls: urls} : {}, ["requestHeaders", "blocking"]);
        }
    };

    /**
     * Gets URL of a file that belongs to our extension
     */
    adguard.getURL = browser.extension.getURL;

    adguard.i18n = browser.i18n;

    adguard.backgroundPage = {};
    adguard.backgroundPage.getWindow = function () {
        return browser.extension.getBackgroundPage();
    };

    adguard.app = {

        /**
         * Extension ID
         */
        getId: function () {
            return browser.runtime.id;
        },

        /**
         * Gets extension scheme
         * @returns "chrome-extension" for Chrome," ms-browser-extension" for Edge
         */
        getUrlScheme: function () {
            var url = adguard.getURL('test.html');
            var index = url.indexOf('://');
            return url.substring(0, index);
        },

        /**
         * Extension version
         */
        getVersion: function () {
            return browser.runtime.getManifest().version;
        },

        /**
         * Extension UI locale
         */
        getLocale: function () {
            return browser.i18n.getUILanguage();
        }
    };

    adguard.webRequest = {
        onBeforeRequest: onBeforeRequest,
        handlerBehaviorChanged: browser.webRequest.handlerBehaviorChanged,
        onCompleted: browser.webRequest.onCompleted,
        onErrorOccurred: browser.webRequest.onErrorOccurred,
        onHeadersReceived: onHeadersReceived,
        onBeforeSendHeaders: onBeforeSendHeaders
    };

    var onCreatedNavigationTarget = {

        addListener: function (callback) {

            browser.webNavigation.onCreatedNavigationTarget.addListener(function (details) {

                if (details.tabId === -1) {
                    return;
                }

                callback({
                    tabId: details.tabId,
                    sourceTabId: details.sourceTabId,
                    url: details.url
                });
            });
        }
    };

    adguard.webNavigation = {
        onCreatedNavigationTarget: onCreatedNavigationTarget
    };

    //noinspection JSUnusedLocalSymbols,JSHint
    adguard.browserAction = {

        setBrowserAction: function (tab, icon, badge, badgeColor, title) {

            var tabId = tab.tabId;

            var onIconReady = function () {
                if (browser.runtime.lastError) {
                    return;
                }
                browser.browserAction.setBadgeText({tabId: tabId, text: badge});

                if (browser.runtime.lastError) {
                    return;
                }
                if (badge) {
                    browser.browserAction.setBadgeBackgroundColor({tabId: tabId, color: badgeColor});
                }

                //title setup via manifest.json file
                //chrome.browserAction.setTitle({tabId: tabId, title: title});
            };

            /**
             * Workaround for MS Edge.
             * For some reason Edge changes the inner state of the "icon" object and adds a tabId property inside.
             */
            delete icon.tabId;

            if (browser.runtime.lastError) {
                return;
            }

            browser.browserAction.setIcon({tabId: tabId, path: icon}, onIconReady);
        },
        setPopup: function () {
            // Do nothing. Popup is already installed in manifest file
        },
        close: function () {
            // Do nothing
        }
    };

    adguard.contextMenus = browser.contextMenus;

})(adguard);