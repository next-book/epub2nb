// Adapted from the cli.js utility code from the r2-share-js repo of the Readium2 project
// under license below.

// ==LICENSE-BEGIN==
// Copyright 2017 European Digital Reading Lab. All rights reserved.
// Licensed to the Readium Foundation under one or more contributor license agreements.
// Use of this source code is governed by a BSD-style license
// that can be found in the LICENSE file exposed on Github (readium) in the project repository.
// ==LICENSE-END==

const crypto = require('crypto');
const deepEqual = require('fast-deep-equal');
const fs = require('fs');
const jsonDiff = require('json-diff');
const path = require('path');
const { URL } = require('url');
const util = require('util');

const { MediaOverlayNode } = require('r2-shared-js/dist/es8-es2017/src/models/media-overlay');
const { Publication } = require('r2-shared-js/dist/es8-es2017/src/models/publication');
const { Link } = require('r2-shared-js/dist/es8-es2017/src/models/publication-link');
const {
  AudioBookis,
  isAudioBookPublication,
} = require('r2-shared-js/dist/es8-es2017/src/parser/audiobook');
const {
  DaisyBookis,
  isDaisyPublication,
} = require('r2-shared-js/dist/es8-es2017/src/parser/daisy');
const {
  convertDaisyToReadiumWebPub,
} = require('r2-shared-js/dist/es8-es2017/src/parser/daisy-convert-to-epub');
const { isEPUBlication } = require('r2-shared-js/dist/es8-es2017/src/parser/epub');
const {
  lazyLoadMediaOverlays,
} = require('r2-shared-js/dist/es8-es2017/src/parser/epub-daisy-common');
const {
  PublicationParsePromise,
} = require('r2-shared-js/dist/es8-es2017/src/parser/publication-parser');
const { setLcpNativePluginPath } = require('r2-lcp-js/dist/es8-es2017/src/parser/epub/lcp');
const {
  JsonArray,
  JsonMap,
  TaJsonDeserialize,
  TaJsonSerialize,
} = require('r2-lcp-js/dist/es8-es2017/src/serializable');
const { isHTTP } = require('r2-utils-js/dist/es8-es2017/src/_utils/http/UrlUtils');
const {
  streamToBufferPromise,
} = require('r2-utils-js/dist/es8-es2017/src/_utils/stream/BufferUtils');
const { IStreamAndLength, IZip } = require('r2-utils-js/dist/es8-es2017/src/_utils/zip/zip');
const { Transformers } = require('r2-shared-js/dist/es8-es2017/src/transform/transformer');

const {
  initGlobalConverters_GENERIC,
  initGlobalConverters_SHARED,
} = require('r2-shared-js/dist/es8-es2017/src/init-globals');
const { zipHasEntry } = require('r2-shared-js/dist/es8-es2017/src/_utils/zipHasEntry');

initGlobalConverters_SHARED();
initGlobalConverters_GENERIC();

setLcpNativePluginPath(path.join(process.cwd(), 'LCP', 'lcp.node'));

function epub2readium(filePath, outputDirPath, callback, decryptKeysCombined) {
  if (!isHTTP(filePath)) {
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, filePath);
      console.log(filePath);
      if (!fs.existsSync(filePath)) {
        filePath = path.join(process.cwd(), filePath);
        console.log(filePath);
        if (!fs.existsSync(filePath)) {
          console.log('FILEPATH DOES NOT EXIST.');
          process.exit(1);
        }
      }
    }

    const stats = fs.lstatSync(filePath);
    if (!stats.isFile() && !stats.isDirectory()) {
      console.log('FILEPATH MUST BE FILE OR DIRECTORY.');
      process.exit(1);
    }
  }

  let fileName = filePath;
  if (isHTTP(filePath)) {
    const url = new URL(filePath);
    fileName = url.pathname;
  }
  fileName = fileName.replace(/META-INF[\/|\\]container.xml$/, '');
  fileName = path.basename(fileName);

  let decryptKeys;
  if (decryptKeysCombined) {
    decryptKeys = decryptKeysCombined.trim().split(';');
  }

  // tslint:disable-next-line:no-floating-promises
  (async () => {
    let publication;
    try {
      publication = await PublicationParsePromise(filePath);
    } catch (err) {
      console.log('== Publication Parser: reject');
      console.log(err);
      return;
    }

    const isAnEPUB = isEPUBlication(filePath);
    let isAnAudioBook;
    try {
      isAnAudioBook = await isAudioBookPublication(filePath);
    } catch (_err) {
      // console.log(err);
      // ignore
    }

    if ((isAnAudioBook || isAnEPUB) && outputDirPath) {
      try {
        await extractEPUB(
          isAnEPUB || isDaisyBook ? true : false,
          publication,
          outputDirPath,
          decryptKeys
        );
        callback();
      } catch (err) {
        console.log('== Publication extract FAIL');
        console.log(err);
        return;
      }
    } else {
      //  if (ext === ".cbz")
      await dumpPublication(publication);
    }
  })();
}

function extractEPUB_ManifestJSON(pub, outDir, keys) {
  const manifestJson = TaJsonSerialize(pub);

  const arrLinks = [];
  if (manifestJson.readingOrder) {
    arrLinks.push(...manifestJson.readingOrder);
  }
  if (manifestJson.resources) {
    arrLinks.push(...manifestJson.resources);
  }

  if (keys) {
    arrLinks.forEach(link => {
      if (
        link.properties &&
        link.properties.encrypted &&
        link.properties.encrypted.scheme === 'http://readium.org/2014/01/lcp'
      ) {
        delete link.properties.encrypted;

        let atLeastOne = false;
        const jsonProps = Object.keys(link.properties);
        if (jsonProps) {
          jsonProps.forEach(jsonProp => {
            if (link.properties.hasOwnProperty(jsonProp)) {
              atLeastOne = true;
              return false;
            }
            return true;
          });
        }
        if (!atLeastOne) {
          delete link.properties;
        }
      }
    });
    if (manifestJson.links) {
      const lks = manifestJson.links;
      let index = -1;
      for (let i = 0; i < lks.length; i++) {
        const link = lks[i];
        if (
          link.type === 'application/vnd.readium.lcp.license.v1.0+json' &&
          link.rel === 'license'
        ) {
          index = i;
          break;
        }
      }
      if (index >= 0) {
        lks.splice(index, 1);
      }
      if (lks.length === 0) {
        delete manifestJson.links;
      }
    }
  }

  arrLinks.forEach(link => {
    if (
      link.properties &&
      link.properties.encrypted &&
      (link.properties.encrypted.algorithm === 'http://www.idpf.org/2008/embedding' ||
        link.properties.encrypted.algorithm === 'http://ns.adobe.com/pdf/enc#RC')
    ) {
      delete link.properties.encrypted;

      let atLeastOne = false;
      const jsonProps = Object.keys(link.properties);
      if (jsonProps) {
        jsonProps.forEach(jsonProp => {
          if (link.properties.hasOwnProperty(jsonProp)) {
            atLeastOne = true;
            return false;
          }
          return true;
        });
      }
      if (!atLeastOne) {
        delete link.properties;
      }
    }
  });

  const manifestJsonStr = JSON.stringify(manifestJson, null, '  ');
  // console.log(manifestJsonStr);

  const manifestJsonPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestJsonPath, manifestJsonStr, 'utf8');
}

async function extractEPUB_Check(zip, outDir) {
  let zipEntries;
  try {
    zipEntries = await zip.getEntries();
  } catch (err) {
    console.log(err);
  }
  if (zipEntries) {
    for (const zipEntry of zipEntries) {
      if (
        zipEntry !== 'mimetype' &&
        !zipEntry.startsWith('META-INF/') &&
        !zipEntry.endsWith('.opf') &&
        zipEntry !== 'publication.json' &&
        zipEntry !== 'license.lcpl' &&
        !zipEntry.endsWith('.DS_Store') &&
        !zipEntry.startsWith('__MACOSX/')
      ) {
        // zip entry can actually be exploded EPUB file

        const expectedOutputPath = path.join(outDir, zipEntry);
        if (!fs.existsSync(expectedOutputPath)) {
          console.log('Zip entry not extracted??');
          console.log(expectedOutputPath);
        }
      }
    }
  }
}

async function extractEPUB_ProcessKeys(pub, keys) {
  if (!pub.LCP || !keys) {
    return;
  }

  const keysSha256Hex = keys.map(key => {
    console.log('@@@');
    console.log(key);

    // sniffing for already-encoded plain-text passphrase
    // (looking for SHA256 checksum / hex digest)
    if (key.length === 64) {
      // 32 bytes
      let isHex = true;
      for (let i = 0; i < key.length; i += 2) {
        const hexByte = key.substr(i, 2).toLowerCase();

        const parsedInt = parseInt(hexByte, 16);
        if (isNaN(parsedInt)) {
          isHex = false;
          break;
        }

        // let hexByteCheck = parsedInt.toString(16);
        // if (hexByteCheck.length === 1) {
        //     hexByteCheck = "0" + hexByteCheck; // pad
        // }
        // // console.log(hexByteCheck);
        // if (hexByteCheck !== hexByte) {
        //     console.log(hexByte + " != " + hexByteCheck);
        //     isHex = false;
        //     break;
        // }
      }
      if (isHex) {
        return key;
      }
    }

    const checkSum = crypto.createHash('sha256');
    checkSum.update(key);
    const keySha256Hex = checkSum.digest('hex');
    console.log(keySha256Hex);
    return keySha256Hex;

    // const lcpPass64 = Buffer.from(hash).toString("base64");
    // const lcpPassHex = Buffer.from(lcpPass64, "base64").toString("utf8");
  });

  try {
    await pub.LCP.tryUserKeys(keysSha256Hex);
  } catch (err) {
    console.log(err);
    throw Error('FAIL publication.LCP.tryUserKeys()');

    // DRMErrorCode (from r2-lcp-client)
    // 1 === NO CORRECT PASSPHRASE / UERKEY IN GIVEN ARRAY
    //     // No error
    //     NONE = 0,
    //     /**
    //         WARNING ERRORS > 10
    //     **/
    //     // License is out of date (check start and end date)
    //     LICENSE_OUT_OF_DATE = 11,
    //     /**
    //         CRITICAL ERRORS > 100
    //     **/
    //     // Certificate has been revoked in the CRL
    //     CERTIFICATE_REVOKED = 101,
    //     // Certificate has not been signed by CA
    //     CERTIFICATE_SIGNATURE_INVALID = 102,
    //     // License has been issued by an expired certificate
    //     LICENSE_SIGNATURE_DATE_INVALID = 111,
    //     // License signature does not match
    //     LICENSE_SIGNATURE_INVALID = 112,
    //     // The drm context is invalid
    //     CONTEXT_INVALID = 121,
    //     // Unable to decrypt encrypted content key from user key
    //     CONTENT_KEY_DECRYPT_ERROR = 131,
    //     // User key check invalid
    //     USER_KEY_CHECK_INVALID = 141,
    //     // Unable to decrypt encrypted content from content key
    //     CONTENT_DECRYPT_ERROR = 151
  }
}

async function extractEPUB_Link(pub, zip, outDir, link) {
  const hrefDecoded = link.HrefDecoded;
  //console.log("===== " + hrefDecoded);
  if (!hrefDecoded) {
    console.log('!?link.HrefDecoded');
    return;
  }

  const has = await zipHasEntry(zip, hrefDecoded, link.Href);
  if (!has) {
    console.log(`NOT IN ZIP (extractEPUB_Link): ${link.Href} --- ${hrefDecoded}`);
    const zipEntries = await zip.getEntries();
    for (const zipEntry of zipEntries) {
      console.log(zipEntry);
    }
    return;
  }

  let zipStream_;
  try {
    zipStream_ = await zip.entryStreamPromise(hrefDecoded);
  } catch (err) {
    console.log(hrefDecoded);
    console.log(err);
    return;
  }

  let transformedStream;
  try {
    transformedStream = await Transformers.tryStream(
      pub,
      link,
      undefined,
      zipStream_,
      false,
      0,
      0,
      undefined
    );
  } catch (err) {
    // Note that the "LCP not ready!" message is a warning, not an error caught here.
    console.log(hrefDecoded);
    console.log(err);
    return;
  }

  // if (transformedStream !== zipStream_) {
  //     console.log("(asset transformed)");
  // }
  zipStream_ = transformedStream; // can be unchanged

  let zipData;
  try {
    zipData = await streamToBufferPromise(zipStream_.stream);
  } catch (err) {
    console.log(hrefDecoded);
    console.log(err);
    return;
  }
  // console.log("CHECK: " + zipStream_.length + " ==> " + zipData.length);

  const linkOutputPath = path.join(outDir, hrefDecoded);
  ensureDirs(linkOutputPath);
  fs.writeFileSync(linkOutputPath, zipData);
}

async function extractEPUB(isEPUB, pub, outDir, keys) {
  // automatically handles exploded filesystem too,
  // via the zip-ex.ts abstraction in r2-utils-js
  // returned by zip-factory.ts (zipLoadPromise() function)
  const zipInternal = pub.findFromInternal('zip');
  if (!zipInternal) {
    console.log('No publication zip!?');
    return;
  }

  const zip = zipInternal.Value;

  try {
    await extractEPUB_ProcessKeys(pub, keys);
  } catch (err) {
    console.log(err);
    throw err;
  }

  // fs.mkdirSync // { recursive: false }
  ensureDirs(path.join(outDir, 'DUMMY_FILE.EXT'));

  try {
    await extractEPUB_MediaOverlays(pub, zip, outDir);
  } catch (err) {
    console.log(err);
  }

  extractEPUB_ManifestJSON(pub, outDir, keys);

  const links = [];
  if (pub.Resources) {
    links.push(...pub.Resources);
  }
  if (pub.Spine) {
    // JSON.readingOrder
    links.push(...pub.Spine);
  }
  // if (await zipHasEntry(zip, "META-INF/container.xml", undefined)) {
  //     const l = new Link();
  //     l.setHrefDecoded("META-INF/container.xml");
  //     links.push(l);
  // }
  if (!keys) {
    const lic = (isEPUB ? 'META-INF/' : '') + 'license.lcpl';
    const has = await zipHasEntry(zip, lic, undefined);
    if (has) {
      const l = new Link();
      l.setHrefDecoded(lic);
      links.push(l);
    }
  }
  for (const link of links) {
    try {
      await extractEPUB_Link(pub, zip, outDir, link);
    } catch (err) {
      console.log(err);
    }
  }

  try {
    await extractEPUB_Check(zip, outDir);
  } catch (err) {
    console.log(err);
  }
}

async function extractEPUB_MediaOverlays(pub, _zip, outDir) {
  if (!pub.Spine) {
    return;
  }

  let i = -1;
  for (const spineItem of pub.Spine) {
    if (spineItem.MediaOverlays) {
      const mo = spineItem.MediaOverlays;
      // console.log(util.inspect(mo,
      //     { showHidden: false, depth: 1000, colors: true, customInspect: true }));
      // console.log(mo.SmilPathInZip);

      try {
        // mo.initialized true/false is automatically handled
        await lazyLoadMediaOverlays(pub, mo);
      } catch (err) {
        return Promise.reject(err);
      }
      const moJsonObj = TaJsonSerialize(mo);
      const moJsonStr = global.JSON.stringify(moJsonObj, null, '  ');

      i++;
      const p = `media-overlays_${i}.json`;

      const moJsonPath = path.join(outDir, p);
      fs.writeFileSync(moJsonPath, moJsonStr, 'utf8');

      if (spineItem.Properties && spineItem.Properties.MediaOverlay) {
        spineItem.Properties.MediaOverlay = p;
      }
      if (spineItem.Alternate) {
        for (const altLink of spineItem.Alternate) {
          if (altLink.TypeLink === 'application/vnd.syncnarr+json') {
            altLink.Href = p;
          }
        }
      }
    }
  }
}

function ensureDirs(fspath) {
  const dirname = path.dirname(fspath);

  if (!fs.existsSync(dirname)) {
    ensureDirs(dirname);
    fs.mkdirSync(dirname);
  }
}

async function dumpPublication(publication) {
  console.log('#### RAW OBJECT:');
  // breakLength: 100  maxArrayLength: undefined
  console.log(
    util.inspect(publication, {
      showHidden: false,
      depth: 1000,
      colors: true,
      customInspect: true,
    })
  );

  const publicationJsonObj = TaJsonSerialize(publication);
  console.log(
    util.inspect(publicationJsonObj, {
      showHidden: false,
      depth: 1000,
      colors: true,
      customInspect: true,
    })
  );

  const publicationJsonStr = global.JSON.stringify(publicationJsonObj, null, '  ');

  // const publicationJsonStrCanonical = JSON.stringify(sortObject(publicationJsonObj));

  const publicationReverse = TaJsonDeserialize(publicationJsonObj, Publication);
  // publicationReverse.AddLink("fake type", ["fake rel"], "fake url", undefined);

  const publicationJsonObjReverse = TaJsonSerialize(publicationReverse);

  const eq = deepEqual(publicationJsonObj, publicationJsonObjReverse);
  if (!eq) {
    console.log('#### TA-JSON SERIALIZED JSON OBJ:');
    console.log(publicationJsonObj);

    console.log('#### STRINGIFIED JSON OBJ:');
    console.log(publicationJsonStr);

    // console.log("#### CANONICAL JSON:");
    // console.log(publicationJsonStrCanonical);

    console.log('#### TA-JSON DESERIALIZED (REVERSE):');
    console.log(
      util.inspect(publicationReverse, {
        showHidden: false,
        depth: 1000,
        colors: true,
        customInspect: true,
      })
    );

    console.log('#### TA-JSON SERIALIZED JSON OBJ (REVERSE):');
    console.log(publicationJsonObjReverse);

    console.log('#### REVERSE NOT DEEP EQUAL!\n\n');
    console.log('#### REVERSE NOT DEEP EQUAL!\n\n');
    console.log('#### REVERSE NOT DEEP EQUAL!\n\n');
  }
  console.log(jsonDiff.diffString(publicationJsonObj, publicationJsonObjReverse));

  if (publication.Spine) {
    for (const spineItem of publication.Spine) {
      if (spineItem.Properties && spineItem.Properties.MediaOverlay) {
        console.log(spineItem.Href); // OPS/chapter_002.xhtml
        console.log(spineItem.Properties.MediaOverlay); // media-overlay.json?resource=OPS%2Fchapter_002.xhtml
        console.log(spineItem.Duration); // 543
      }
      if (spineItem.Alternate) {
        for (const altLink of spineItem.Alternate) {
          if (altLink.TypeLink === 'application/vnd.syncnarr+json') {
            console.log(altLink.Href); // media-overlay.json?resource=OPS%2Fchapter_002.xhtml
            console.log(altLink.TypeLink); // application/vnd.syncnarr+json
            console.log(altLink.Duration); // 543
          }
        }
      }
      if (spineItem.MediaOverlays) {
        const mo = spineItem.MediaOverlays;
        if (!mo.initialized) {
          console.log(
            util.inspect(mo, {
              showHidden: false,
              depth: 1000,
              colors: true,
              customInspect: true,
            })
          );
        }
        console.log(mo.SmilPathInZip);

        try {
          // mo.initialized true/false is automatically handled
          await lazyLoadMediaOverlays(publication, mo);
        } catch (err) {
          return Promise.reject(err);
        }
        // console.log(util.inspect(mo,
        //     { showHidden: false, depth: 1000, colors: true, customInspect: true }));
        const moJsonObj = TaJsonSerialize(mo);
        // console.log(util.inspect(moJsonObj,
        //     { showHidden: false, depth: 1000, colors: true, customInspect: true }));

        const moJsonStr = global.JSON.stringify(moJsonObj, null, '  ');
        console.log(moJsonStr.substr(0, 1000) + '\n...\n');

        // const moJsonStrCanonical = JSON.stringify(sortObject(moJsonObj));

        const moReverse = TaJsonDeserialize(moJsonObj, MediaOverlayNode);
        // moReverse.AddLink("fake type", ["fake rel"], "fake url", undefined);

        const moJsonObjReverse = TaJsonSerialize(moReverse);

        const equa = deepEqual(moJsonObj, moJsonObjReverse);
        if (!equa) {
          console.log('#### TA-JSON SERIALIZED JSON OBJ:');
          console.log(moJsonObj);

          console.log('#### STRINGIFIED JSON OBJ:');
          console.log(moJsonStr);

          // console.log("#### CANONICAL JSON:");
          // console.log(moJsonStrCanonical);

          console.log('#### TA-JSON DESERIALIZED (REVERSE):');
          console.log(
            util.inspect(moReverse, {
              showHidden: false,
              depth: 1000,
              colors: true,
              customInspect: true,
            })
          );

          console.log('#### TA-JSON SERIALIZED JSON OBJ (REVERSE):');
          console.log(moJsonObjReverse);

          console.log('#### REVERSE NOT DEEP EQUAL!\n\n');
          console.log('#### REVERSE NOT DEEP EQUAL!\n\n');
          console.log('#### REVERSE NOT DEEP EQUAL!\n\n');
        }
        console.log(jsonDiff.diffString(moJsonObj, moJsonObjReverse));
      }
    }
  }
}

module.exports = epub2readium;
