/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BaseTreeViewer } from "./base_tree_viewer.js";
import { PromiseCapability } from "pdfjs-lib";
import { SidebarView } from "./ui_utils.js";

/**
 * @typedef {Object} PDFOutlineViewerOptions
 * @property {HTMLDivElement} container - The viewer element.
 * @property {EventBus} eventBus - The application event bus.
 * @property {IPDFLinkService} linkService - The navigation/linking service.
 * @property {DownloadManager} downloadManager - The download manager.
 */

/**
 * @typedef {Object} PDFOutlineViewerRenderParameters
 * @property {Array|null} outline - An array of outline objects.
 * @property {PDFDocument} pdfDocument - A {PDFDocument} instance.
 */

class BAWSOutlineViewer extends BaseTreeViewer {
  /**
   * @param {PDFOutlineViewerOptions} options
   */
  constructor(options) {
    super(options);
    this.linkService = options.linkService;
    this.downloadManager = options.downloadManager;
    this.page2element = {};

    this.eventBus._on("toggleoutlinetree", this._toggleAllTreeItems.bind(this));
    this.eventBus._on(
      "currentoutlineitem",
      this._currentOutlineItem.bind(this)
    );

    this.eventBus._on("pagechanging", evt => {
      this._currentPageNumber = evt.pageNumber;
    });
    this.eventBus._on("pagesloaded", evt => {
      this._isPagesLoaded = !!evt.pagesCount;

      // If the capability is still pending, see the `_dispatchEvent`-method,
      // we know that the `currentOutlineItem`-button can be enabled here.
      if (
        this._currentOutlineItemCapability &&
        !this._currentOutlineItemCapability.settled
      ) {
        this._currentOutlineItemCapability.resolve(
          /* enabled = */ this._isPagesLoaded
        );
      }
    });
    this.eventBus._on("sidebarviewchanged", evt => {
      this._sidebarView = evt.view;
    });
  }

  reset() {
    super.reset();
    this._outline = null;

    this._pageNumberToDestHashCapability = null;
    this._currentPageNumber = 1;
    this._isPagesLoaded = null;

    if (
      this._currentOutlineItemCapability &&
      !this._currentOutlineItemCapability.settled
    ) {
      this._currentOutlineItemCapability.resolve(/* enabled = */ false);
    }
    this._currentOutlineItemCapability = null;
  }

  /**
   * @private
   */
  _dispatchEvent(outlineCount) {
    this._currentOutlineItemCapability = new PromiseCapability();
    if (
      outlineCount === 0 
    ) {
      this._currentOutlineItemCapability.resolve(/* enabled = */ false);
    } else if (this._isPagesLoaded !== null) {
      this._currentOutlineItemCapability.resolve(
        /* enabled = */ this._isPagesLoaded
      );
    }

    this.eventBus.dispatch("outlineloaded", {
      source: this,
      outlineCount,
      currentOutlineItemPromise: this._currentOutlineItemCapability.promise,
    });
  }

  /**
   * @private
   */
  _bindLink(
    element,
    { url, newWindow, action, attachment, dest, setOCGState }
  ) {
    const { linkService } = this;

    if (url) {
      linkService.addLinkAttributes(element, url, newWindow);
      return;
    }
    if (action) {
      element.href = linkService.getAnchorUrl("");
      element.onclick = () => {
        linkService.executeNamedAction(action);
        return false;
      };
      return;
    }
    if (attachment) {
      element.href = linkService.getAnchorUrl("");
      element.onclick = () => {
        this.downloadManager.openOrDownloadData(
          element,
          attachment.content,
          attachment.filename
        );
        return false;
      };
      return;
    }
    if (setOCGState) {
      element.href = linkService.getAnchorUrl("");
      element.onclick = () => {
        linkService.executeSetOCGState(setOCGState);
        return false;
      };
      return;
    }

    element.href = linkService.getDestinationHash(dest);
    element.onclick = evt => {
      this._updateCurrentTreeItem(evt.target.parentNode);

      if (dest) {
        linkService.goToPage(dest); // TODO: Add code to turn page
      }
      return false;
    };
  }

  /**
   * @private
   */
  _setStyles(element, { bold, italic }) {
    if (bold) {
      element.style.fontWeight = "bold";
    }
    if (italic) {
      element.style.fontStyle = "italic";
    }
  }

  /**
   * @private
   */
  _addToggleButton(div, { count, items }) {
    let hidden = false;
    if (count < 0) {
      let totalCount = items.length;
      if (totalCount > 0) {
        const queue = [...items];
        while (queue.length > 0) {
          const { count: nestedCount, items: nestedItems } = queue.shift();
          if (nestedCount > 0 && nestedItems.length > 0) {
            totalCount += nestedItems.length;
            queue.push(...nestedItems);
          }
        }
      }
      if (Math.abs(count) === totalCount) {
        hidden = true;
      }
    }
    super._addToggleButton(div, hidden);
  }

  /**
   * @private
   */
  _toggleAllTreeItems() {
    if (!this._outline) {
      return;
    }
    super._toggleAllTreeItems();
  }

  /**
   * @param {PDFOutlineViewerRenderParameters} params
   */
  render({ outline, pdfDocument }) {
    if (this._outline) {
      this.reset();
    }
    this._outline = outline || null;
    this._pdfDocument = pdfDocument || null;

    if (!outline) {
      this._dispatchEvent(/* outlineCount = */ 0);
      return;
    }

    const fragment = document.createDocumentFragment();
    const queue = [{ parent: fragment, items: outline.items }];
    let outlineCount = 0,
      hasAnyNesting = false;
    while (queue.length > 0) {
      const levelData = queue.shift();
      for (const item of levelData.items) {
        const div = document.createElement("div");
        div.className = "treeItem";

        const element = document.createElement("a");
        this._bindLink(element, item);
        this.page2element[item.dest] = element;
        this._setStyles(element, item);
        element.textContent = this._normalizeTextContent(item.title);

        div.append(element);

        if (item.items.length > 0) {
          hasAnyNesting = true;
          this._addToggleButton(div, item);

          const itemsDiv = document.createElement("div");
          itemsDiv.className = "treeItems";
          div.append(itemsDiv);

          queue.push({ parent: itemsDiv, items: item.items });
        }

        levelData.parent.append(div);
        outlineCount++;
      }
    }

    this._finishRendering(fragment, outlineCount, hasAnyNesting);
  }

  /**
   * Find/highlight the current outline item, corresponding to the active page.
   * @private
   */
  async _currentOutlineItem() {
    if (!this._isPagesLoaded) {
      throw new Error("_currentOutlineItem: All pages have not been loaded.");
    }
    if (!this._outline || !this._pdfDocument) {
      return;
    }
    //TODO just for safety let's keep desthash as BAWS.Level.PageNumber 

    let targetNode = null;
    let page = this._currentPageNumber;
    do{

      targetNode = this.page2element[page];
      page--;

    } while (targetNode == null && (page > 0)  )
    if (targetNode){
      this._scrollToCurrentTreeItem(targetNode.parentNode);
    }
    
  }

  /**
   * To (significantly) simplify the overall implementation, we will only
   * consider *one* destination per page when finding/highlighting the current
   * outline item (similar to e.g. Adobe Reader); more specifically, we choose
   * the *first* outline item at the *lowest* level of the outline tree.
   * @private
   */
  async _getPageNumberToDestHash(pdfDocument) {
  }

}

export { BAWSOutlineViewer };
