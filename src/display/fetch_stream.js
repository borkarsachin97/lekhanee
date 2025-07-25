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

import {
  AbortException,
  assert,
  PromiseCapability,
  warn,
} from "../shared/util.js";
import {
  createResponseStatusError,
  extractFilenameFromHeader,
  validateRangeRequestCapabilities,
  validateResponseStatus,
} from "./network_utils.js";

if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
  throw new Error(
    'Module "./fetch_stream.js" shall not be used with MOZCENTRAL builds.'
  );
}

function createFetchOptions(headers, withCredentials, abortController) {
  return {
    method: "GET",
    headers,
    signal: abortController.signal,
    mode: "cors",
    credentials: withCredentials ? "include" : "same-origin",
    redirect: "follow",
    cache:"force-cache",
  };
}

function createHeaders(httpHeaders) {
  const headers = new Headers();
  for (const property in httpHeaders) {
    const value = httpHeaders[property];
    if (value === undefined) {
      continue;
    }
    headers.append(property, value);
  }
  return headers;
}

function getArrayBuffer(val) {
  if (val instanceof Uint8Array) {
    return val.buffer;
  }
  if (val instanceof ArrayBuffer) {
    return val;
  }
  warn(`getArrayBuffer - unexpected data format: ${val}`);
  return new Uint8Array(val).buffer;
}

/** @implements {IPDFStream} */
class PDFFetchStream {
  constructor(source) {
    this.source = source;
    this.isHttp = /^https?:/i.test(source.url);
    this.httpHeaders = (this.isHttp && source.httpHeaders) || {};

    this._fullRequestReader = null;
    this._rangeRequestReaders = [];
  }

  get _progressiveDataLength() {
    return this._fullRequestReader?._loaded ?? 0;
  }

  getFullReader() {
    assert(
      !this._fullRequestReader,
      "PDFFetchStream.getFullReader can only be called once."
    );
    this._fullRequestReader = new PDFFetchStreamReader(this);
    return this._fullRequestReader;
  }

  getRangeReader(begin, end) {
    if (end <= this._progressiveDataLength) {
      return null;
    }
    const reader = new PDFFetchStreamRangeReader(this, begin, end);
    this._rangeRequestReaders.push(reader);
    return reader;
  }

  cancelAllRequests(reason) {
    this._fullRequestReader?.cancel(reason);

    for (const reader of this._rangeRequestReaders.slice(0)) {
      reader.cancel(reason);
    }
  }
}

/** @implements {IPDFStreamReader} */
class PDFFetchStreamReader {
  constructor(stream) {
    this._stream = stream;
    this._reader = null;
    this._loaded = 0;
    this._filename = null;
    const source = stream.source;
    this._withCredentials = source.withCredentials || false;
    this._contentLength = source.length;
    this._headersCapability = new PromiseCapability();
    this._disableRange = source.disableRange || false;
    this._rangeChunkSize = source.rangeChunkSize;
    if (!this._rangeChunkSize && !this._disableRange) {
      this._disableRange = true;
    }

    this._abortController = new AbortController();
    this._isStreamingSupported = !source.disableStream;
    this._isRangeSupported = !source.disableRange;

    this._headers = createHeaders(this._stream.httpHeaders);
    this._headers.append("Range", `bytes=0-65535`);

    const url = source.url;
    fetch(
      url,
      createFetchOptions(
        this._headers,
        this._withCredentials,
        this._abortController
      )
    )
      .then(response => {
        if (!validateResponseStatus(response.status)) {
          throw createResponseStatusError(response.status, url);
        }
        this._reader = response.body.getReader();
        this._headersCapability.resolve();

        const getResponseHeader = name => {
          return response.headers.get(name);
        };
        const { allowRangeRequests, suggestedLength } =
          validateRangeRequestCapabilities({
            getResponseHeader,
            isHttp: this._stream.isHttp,
            rangeChunkSize: this._rangeChunkSize,
            disableRange: this._disableRange,
          });

        this._isRangeSupported = allowRangeRequests;
        // Setting right content length.
        this._contentLength = suggestedLength || this._contentLength;

        this._filename = extractFilenameFromHeader(getResponseHeader);

        // We need to stop reading when range is supported and streaming is
        // disabled.
        if (!this._isStreamingSupported && this._isRangeSupported) {
          //this.cancel(new AbortException("Streaming is disabled."));
          console.log("not cancelling the first request");  
        }
      })
      .catch(this._headersCapability.reject);

    this.onProgress = null;
  }

  get headersReady() {
    return this._headersCapability.promise;
  }

  get filename() {
    return this._filename;
  }

  get contentLength() {
    return this._contentLength;
  }

  get isRangeSupported() {
    return this._isRangeSupported;
  }

  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  async read() {
    await this._headersCapability.promise;
    const { value, done } = await this._reader.read();
    if (done) {
      return { value, done };
    }
    this._loaded += value.byteLength;
    this.onProgress?.({
      loaded: this._loaded,
      total: this._contentLength,
    });

    return { value: getArrayBuffer(value), done: false };
  }

  cancel(reason) {
    this._reader?.cancel(reason);
    this._abortController.abort();
  }
}

/** @implements {IPDFStreamRangeReader} */
class PDFFetchStreamRangeReader {
  constructor(stream, begin, end) {
    this._stream = stream;
    this._reader = null;
    this._loaded = 0;
    const source = stream.source;
    this._withCredentials = source.withCredentials || false;
    this._readCapability = new PromiseCapability();
    this._isStreamingSupported = !source.disableStream;

    this._abortController = new AbortController();
    this._headers = createHeaders(this._stream.httpHeaders);
    this._headers.append("Range", `bytes=${begin}-${end - 1}`);

    const url = source.url;
    const cache_url = url+`?bytes=${begin}-${end - 1}`;
    this._request = new Request(
	    url,
            createFetchOptions(
            this._headers,
            this._withCredentials,
            this._abortController
          )
        );
    

    caches.open('chunkCache')
    .then(cache=>{
      this._chunkCache = cache;
      return cache.match(cache_url,{ignoreVary: true});
    }).then(resp=>{
      if(resp) {
        if (resp.ok){
          this._readCapability.resolve();
          this._reader = resp.body.getReader();
        }

        this.onProgress = null;
        return;
      } 

      fetch(
        url,
        createFetchOptions(
          this._headers,
          this._withCredentials,
          this._abortController
          )
        ) 
        .then(response => {
          if (!validateResponseStatus(response.status)) {
            throw createResponseStatusError(response.status, url);
          }
          this._readCapability.resolve();
	  let new_response = new Response(response.clone().body, {
		      status: 200,
		      statusText: "OK",
		      headers: response.headers,
		    })

          this._chunkCache.put(cache_url, new_response);
          this._reader = response.body.getReader();
        })
        .catch(this._readCapability.reject);

      this.onProgress = null;
    });
  }
  get isStreamingSupported() {
    return this._isStreamingSupported;
  }

  async read() {
    await this._readCapability.promise;
    const { value, done } = await this._reader.read();
    if (done) {
      return { value, done };
    }
    this._loaded += value.byteLength;
    this.onProgress?.({ loaded: this._loaded });

    return { value: getArrayBuffer(value), done: false };
  }

  cancel(reason) {
    this._reader?.cancel(reason);
    this._abortController.abort();
  }
}

export { PDFFetchStream };
