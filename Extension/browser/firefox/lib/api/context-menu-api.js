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

(function () {

    // https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/PopupGuide/Extensions#Modifying_the_context_menu
    // http://kb.mozillazine.org/Adding_items_to_menus

    adguard.contextMenus = (function () {

        var menuWidget = (function () {

            var CONTENT_AREA_CONTEXT_MENU = 'contentAreaContextMenu';
            var MENU_ITEM_ATTR = 'adguard-menu-item';

            var MENU_ITEM = 'menuitem';
            var MENU_ITEM_MENU = 'menu';
            var MENU_ITEM_POPUP = 'menupopup';

            function getMenuItems(doc, type) {
                if (type) {
                    return doc.querySelectorAll('[' + MENU_ITEM_ATTR + '="' + type + '"]');
                } else {
                    return doc.querySelectorAll('[' + MENU_ITEM_ATTR + ']');
                }
            }

            /**
             * Returns context for element
             */
            function getElementContext(gContextMenu) {
                var contexts = [];
                if (gContextMenu.onImage) {
                    return 'image';
                } else if (gContextMenu.onAudio) {
                    return 'audio';
                } else if (gContextMenu.onLink) {
                    return 'video';
                }

                return contexts;
            }

            function updateItemsVisibility(doc, gContextMenu) {

                // Check context
                for (var i = 0; i < contextMenuProperties.length; i++) {
                    var prop = contextMenuProperties[i];
                    var item = prop.title ? doc.getElementById(prop.title) : null;
                    if (!item) {
                        continue;
                    }
                    if (prop.contexts && prop.contexts.indexOf('all') < 0) {
                        var context = getElementContext(gContextMenu);
                        if (prop.contexts.indexOf(context) < 0) {
                            item.setAttribute('hidden', 'true');
                            continue;
                        }
                    }
                    item.removeAttribute('hidden');
                }
            }

            function onCommand() {

                var itemId = this.id;
                var properties = contextMenuProperties.find(function (prop) {
                    return prop.title == itemId;
                });
                if (properties && typeof properties.onclick === 'function') {
                    properties.onclick();
                }
            }

            function populate(doc, contextMenu) {
                var mainMenu = getMenuItems(contextMenu, MENU_ITEM_MENU)[0];
                if (!mainMenu) {
                    mainMenu = doc.createElement('menu');
                    mainMenu.setAttribute(MENU_ITEM_ATTR, MENU_ITEM_MENU);
                    mainMenu.setAttribute('label', 'Adguard');
                    mainMenu.setAttribute('class', 'addon-context-menu-item addon-context-menu-item-toplevel menu-iconic');
                    mainMenu.setAttribute('image', adguard.prefs.ICONS.ICON_GREEN['16']);
                    contextMenu.appendChild(mainMenu);
                }

                var mainMenuPopup = getMenuItems(contextMenu, MENU_ITEM_POPUP)[0];
                if (!mainMenuPopup) {
                    mainMenuPopup = doc.createElement('menupopup');
                    mainMenuPopup.setAttribute(MENU_ITEM_ATTR, MENU_ITEM_POPUP);
                    mainMenu.appendChild(mainMenuPopup);
                }

                var subMenus = Object.create(null);

                for (var i = 0; i < contextMenuProperties.length; i++) {

                    var prop = contextMenuProperties[i];
                    var item;

                    if ('id' in prop) {

                        // It's sub-menu
                        item = doc.createElement('menu');

                        // Create popup for this sub-menu
                        var subMenuPopup = doc.createElement('menupopup');
                        subMenuPopup.setAttribute(MENU_ITEM_ATTR, MENU_ITEM);

                        item.appendChild(subMenuPopup);
                        subMenus[prop.id] = subMenuPopup;

                    } else if (prop.type === 'separator') {
                        item = doc.createElement('menuseparator');
                    } else {
                        item = doc.createElement('menuitem');
                        if (prop.enabled === false) {
                            item.setAttribute('hidden', true);
                        }
                        item.addEventListener('command', onCommand);
                    }

                    item.setAttribute(MENU_ITEM_ATTR, MENU_ITEM);
                    item.setAttribute('class', 'addon-context-menu-item');

                    if (prop.type !== 'separator') {
                        item.setAttribute('id', prop.title);
                        item.setAttribute('label', prop.title);
                    }

                    if ('parentId' in prop) {
                        subMenus[prop.parentId].appendChild(item);
                    } else {
                        mainMenuPopup.appendChild(item);
                    }
                }
            }

            function onContextMenuMenuShowing(e) {

                var doc = e.target.ownerDocument;
                var gContextMenu = doc.defaultView.gContextMenu;
                if (!gContextMenu || !gContextMenu.browser) {
                    return;
                }

                if (e.target.getAttribute(MENU_ITEM_ATTR)) {
                    return;
                }

                var contextMenu = doc.getElementById(CONTENT_AREA_CONTEXT_MENU);
                if (!contextMenu) {
                    return;
                }

                if (populated) {
                    updateItemsVisibility(doc, gContextMenu);
                    return;
                }

                removeMenuItems(contextMenu, MENU_ITEM);
                populate(doc, contextMenu);
                updateItemsVisibility(doc, gContextMenu);

                populated = true;
            }

            function canCreateContextMenu(win) {
                return win && win.document.readyState === 'complete';
            }

            function createContextMenu(win) {

                if (!canCreateContextMenu(win)) {
                    return;
                }

                var contextMenu = win.document.getElementById(CONTENT_AREA_CONTEXT_MENU);
                if (contextMenu === null) {
                    return;
                }
                contextMenu.addEventListener('popupshowing', onContextMenuMenuShowing);
            }

            function removeMenuItems(doc, type) {
                var items = getMenuItems(doc, type);
                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    if (item.parentNode) {
                        item.parentNode.removeChild(item);
                    }
                    item.removeEventListener('command', onCommand);
                }
            }

            function clearContextMenu(win) {

                var contextMenu = win.document.getElementById(CONTENT_AREA_CONTEXT_MENU);
                if (contextMenu) {
                    contextMenu.removeEventListener('popupshowing', onContextMenuMenuShowing);
                }
                removeMenuItems(win.document);
            }

            function insertContextMenuToWindow(win) {
                adguard.utils.concurrent.retryUntil(
                    canCreateContextMenu.bind(null, win),
                    createContextMenu.bind(null, win)
                );
            }

            adguard.windowsImpl.onUpdated.addListener(function (adgWin, domWin, event) {
                if (event === 'ChromeWindowLoad') {
                    insertContextMenuToWindow(domWin);
                }
            });

            adguard.windowsImpl.onRemoved.addListener(function (windowId, domWin) {
                clearContextMenu(domWin);
            });

            adguard.windowsImpl.forEachNative(insertContextMenuToWindow);

            var populated = false;
            var contextMenuProperties = [];

            var updateProperties = function (properties) {
                contextMenuProperties.push(properties);
            };

            var clearProperties = function () {
                contextMenuProperties = [];
                populated = false;
            };

            return {
                updateProperties: updateProperties,
                clearProperties: clearProperties
            };
        })();

        var removeAll = function () {
            menuWidget.clearProperties();
        };

        var create = function (properties) {
            menuWidget.updateProperties(properties);
        };

        return {
            removeAll: removeAll,
            create: create
        };

    })();

})();