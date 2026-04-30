// Adobe Animate MCP — JSFL bridge (ES3 / SpiderMonkey 1.8)
// Entry: dispatchFromQueueFile(platformPathString) via CEP fl.runScript(bridgeUri, "dispatchFromQueueFile", "\"...path...\"")

(function setupJsonPolyfill() {
  if (typeof JSON !== "undefined" && JSON.parse && JSON.stringify) return;
  JSON = {};
  JSON.parse = function (text) {
    return eval("(" + text + ")");
  };
  JSON.stringify = function (val) {
    function esc(s) {
      return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
    }
    function toJson(v) {
      if (v === null) return "null";
      var t = typeof v;
      if (v === undefined) return "undefined";
      if (t === "boolean" || t === "number") return String(v);
      if (t === "string") return '"' + esc(v) + '"';
      if (v.constructor === Array) {
        var a = [];
        for (var i = 0; i < v.length; i++) a.push(toJson(v[i]));
        return "[" + a.join(",") + "]";
      }
      if (t === "object") {
        var p = [];
        for (var k in v) {
          if (!v.hasOwnProperty(k)) continue;
          if (typeof v[k] === "function") continue;
          p.push('"' + esc(k) + '":' + toJson(v[k]));
        }
        return "{" + p.join(",") + "}";
      }
      return "null";
    }
    return toJson(val);
  };
})();

/** Queue folder (platform path, no trailing slash). Set from CEP JSON — Animate JSFL has no Folder.myDocuments. */
var _bridgeQueueRootPlatform = "";

function bridgeRootUri() {
  var base = _bridgeQueueRootPlatform;
  if (!base || !String(base).length) {
    if (typeof Folder !== "undefined" && Folder.myDocuments && Folder.myDocuments.fsName) {
      base =
        String(Folder.myDocuments.fsName).replace(/\\/g, "/").replace(/\/+$/, "") + "/animate-mcp-bridge";
    } else {
      throw new Error(
        "MCP bridge queue path unset: Animate JSFL has no Folder. Use the CEP panel that sends bridgeQueueRootPlatform (reinstall extension)."
      );
    }
  } else {
    base = String(base).replace(/\\/g, "/").replace(/\/+$/, "");
  }
  return FLfile.platformPathToURI(base + "/");
}

function logLine(msg) {
  try {
    FLfile.write(bridgeRootUri() + "logs.txt", isoNow() + " " + msg + "\r\n", true);
  } catch (e0) {}
}

function isoPad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function isoNow() {
  var d = new Date();
  // Always build UTC ISO-8601 manually: JSFL often lacks Date#toISOString or health checks need stable parseable strings.
  var ms = d.getUTCMilliseconds();
  var ms3 = ms < 10 ? "00" + ms : ms < 100 ? "0" + ms : String(ms);
  return (
    d.getUTCFullYear() +
    "-" +
    isoPad2(d.getUTCMonth() + 1) +
    "-" +
    isoPad2(d.getUTCDate()) +
    "T" +
    isoPad2(d.getUTCHours()) +
    ":" +
    isoPad2(d.getUTCMinutes()) +
    ":" +
    isoPad2(d.getUTCSeconds()) +
    "." +
    ms3 +
    "Z"
  );
}

function readTxtPlatform(platformPathStr) {
  var normalized = String(platformPathStr || "").replace(/\\/g, "/");
  var uri =
    /^file:/.test(normalized) ? normalized : FLfile.platformPathToURI(normalized);
  if (!FLfile.exists(uri)) return null;
  return FLfile.read(uri);
}

function writeResult(id, envelope) {
  FLfile.write(bridgeRootUri() + "result-" + id + ".json", JSON.stringify(envelope, null, 2));
}

function markCommand(platformPathNormalized, status) {
  try {
    var uri = /^file:/.test(platformPathNormalized)
      ? platformPathNormalized
      : FLfile.platformPathToURI(platformPathNormalized);
    var c = FLfile.read(uri);
    var parsed = JSON.parse(c);
    parsed.status = status;
    FLfile.write(uri, JSON.stringify(parsed, null, 2));
  } catch (e1) {}
}

function heartbeat(/* optional panel context JSON from CEP */) {
  var ctx = null;
  try {
    if (arguments.length > 0 && arguments[0] !== undefined && arguments[0] !== null) {
      var raw = String(arguments[0]);
      if (raw.length > 0) {
        ctx = JSON.parse(raw);
      }
    }
  } catch (eCtx) {
    logLine("heartbeat ctx parse: " + String(eCtx && eCtx.message ? eCtx.message : eCtx));
  }
  if (ctx && ctx.bridgeQueueRootPlatform) {
    _bridgeQueueRootPlatform = String(ctx.bridgeQueueRootPlatform)
      .replace(/\\/g, "/")
      .replace(/\/+$/, "");
  }
  ensureBridgeDir();
  var state = {
    protocolVersion: 1,
    lastHeartbeatISO: isoNow(),
    animateBridgeVersion: "1.0.0",
    animateVersion: typeof fl.version === "string" ? fl.version : String(fl.version),
    bridgePanelActive: true,
    lastCommandExecuted: null,
    extensionRootHintFromPanel: ctx && ctx.extensionRootPlatform ? String(ctx.extensionRootPlatform) : "",
    bridgeJsflUriHintFromPanel: ctx && ctx.bridgeJsflUri ? String(ctx.bridgeJsflUri) : "",
    bridgeJsflPlatformPathHintFromPanel:
      ctx && ctx.bridgeJsflPlatformPath ? String(ctx.bridgeJsflPlatformPath) : "",
    bridgeQueueRootPlatformHintFromPanel:
      ctx && ctx.bridgeQueueRootPlatform ? String(ctx.bridgeQueueRootPlatform) : ""
  };
  FLfile.write(bridgeRootUri() + "state.json", JSON.stringify(state, null, 2));
  return JSON.stringify(state);
}

function dispatchFromQueueFile(commandPlatformArg) {
  var platformPath = normalizeEvalArg(commandPlatformArg);
  var txt = readTxtPlatform(platformPath);
  if (!txt) {
    logLine("command file missing: " + platformPath);
    return "missing";
  }
  var env = JSON.parse(txt);
  if (!env || !env.commandId || !env.command) {
    logLine("invalid envelope");
    return "bad";
  }
  markCommand(platformPath, "running");
  var startedAt = isoNow();
  try {
    var data = routeCommand(env.command, env.args || {});
    var out = {
      protocolVersion: 1,
      commandId: env.commandId,
      command: env.command,
      status: "completed",
      data: data,
      error: null,
      startedAt: startedAt,
      completedAt: isoNow()
    };
    writeResult(env.commandId, out);
    markCommand(platformPath, "completed");
    updateState(env.command);
    logLine("ok " + env.command);
    return "ok";
  } catch (e2) {
    var err = {
      protocolVersion: 1,
      commandId: env.commandId,
      command: env.command,
      status: "error",
      data: null,
      error: { message: String(e2 && e2.message ? e2.message : e2) },
      startedAt: startedAt,
      completedAt: isoNow()
    };
    writeResult(env.commandId, err);
    markCommand(platformPath, "error");
    logLine("ERR " + env.command + " " + err.error.message);
    return "error";
  }
}

function normalizeEvalArg(s) {
  if (!s) return "";
  s = String(s);
  if (s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') {
    return s.substring(1, s.length - 1);
  }
  return s;
}

function readPanelHintsFromStateFile() {
  var uri = bridgeRootUri() + "state.json";
  if (!FLfile.exists(uri)) return null;
  try {
    var t = FLfile.read(uri);
    var o = JSON.parse(t);
    return {
      extensionRootHintFromPanel: o.extensionRootHintFromPanel ? String(o.extensionRootHintFromPanel) : "",
      bridgeJsflUriHintFromPanel: o.bridgeJsflUriHintFromPanel ? String(o.bridgeJsflUriHintFromPanel) : "",
      bridgeJsflPlatformPathHintFromPanel: o.bridgeJsflPlatformPathHintFromPanel
        ? String(o.bridgeJsflPlatformPathHintFromPanel)
        : "",
      bridgeQueueRootPlatformHintFromPanel: o.bridgeQueueRootPlatformHintFromPanel
        ? String(o.bridgeQueueRootPlatformHintFromPanel)
        : ""
    };
  } catch (eHint) {}
  return null;
}

function updateState(lastCmd) {
  var hints = readPanelHintsFromStateFile();
  var state = {
    protocolVersion: 1,
    lastHeartbeatISO: isoNow(),
    animateBridgeVersion: "1.0.0",
    animateVersion: typeof fl.version === "string" ? fl.version : String(fl.version),
    bridgePanelActive: true,
    lastCommandExecuted: lastCmd,
    extensionRootHintFromPanel: hints ? hints.extensionRootHintFromPanel : "",
    bridgeJsflUriHintFromPanel: hints ? hints.bridgeJsflUriHintFromPanel : "",
    bridgeJsflPlatformPathHintFromPanel: hints ? hints.bridgeJsflPlatformPathHintFromPanel : "",
    bridgeQueueRootPlatformHintFromPanel: hints ? hints.bridgeQueueRootPlatformHintFromPanel : ""
  };
  FLfile.write(bridgeRootUri() + "state.json", JSON.stringify(state, null, 2));
}

/** Last path segment without directory (works with file:/// and POSIX paths). */
function documentBaseName(full) {
  var s = String(full || "").replace(/\\/g, "/");
  var slash = s.lastIndexOf("/");
  if (slash >= 0) return s.substring(slash + 1);
  return s;
}

function findDom(args) {
  if (!fl.documents || fl.documents.length === 0) {
    throw new Error("No documents open.");
  }
  if (!args || !args.documentName) {
    return fl.getDocumentDOM();
  }
  var needle = documentBaseName(String(args.documentName));
  var needleLower = needle.toLowerCase();
  var stripped = needleLower.replace(/\.fla$/i, "").replace(/\.xfl$/i, "");
  for (var i = 0; i < fl.documents.length; i++) {
    var dn = fl.documents[i].name;
    var base = documentBaseName(dn).toLowerCase();
    var baseStripped = base.replace(/\.fla$/i, "").replace(/\.xfl$/i, "");
    if (dn === args.documentName || base === needleLower || stripped === baseStripped) {
      return fl.documents[i];
    }
  }
  throw new Error('Document "' + args.documentName + '" not found among open documents.');
}

/** Timelines order matches Scenes panel; 1-based sceneIndex. */
function applyScene(dom, args) {
  if (!args || typeof args.sceneIndex !== "number") {
    return dom.getTimeline();
  }
  var idx = args.sceneIndex - 1;
  if (idx < 0 || idx >= dom.timelines.length) {
    throw new Error("sceneIndex out of range.");
  }
  dom.currentTimeline = idx;
  return dom.getTimeline();
}

/** layers[0] is top in Animate layer stack for JSFL (per Adobe docs). */
function layerIndexFromUi(tl, uiIndex, layerName) {
  if (layerName) {
    for (var L = 0; L < tl.layers.length; L++) {
      if (tl.layers[L].name === layerName) return L;
    }
    throw new Error('Layer "' + layerName + '" not found.');
  }
  if (!uiIndex || uiIndex < 1 || uiIndex > tl.layers.length) {
    throw new Error("layerIndex invalid.");
  }
  return uiIndex - 1;
}

function frameUiToIdx(n) {
  return n - 1;
}

/** Serialize Element.matrix when present (Animate JSFL). */
function snapshotMatrix(el) {
  try {
    var m = el.matrix;
    if (!m) return undefined;
    return {
      a: m.a,
      b: m.b,
      c: m.c,
      d: m.d,
      tx: m.tx,
      ty: m.ty
    };
  } catch (em) {}
  return undefined;
}

/** Read common geometry / identity fields defensively (SpiderMonkey ES3). */
function snapshotElement(el, elementIndex, includeMatrix) {
  var out = { elementIndex: elementIndex };
  try {
    out.elementType = el.elementType;
  } catch (e1) {}
  try {
    if (el.name !== undefined && el.name !== null) out.name = String(el.name);
  } catch (e2) {}
  try {
    if (typeof el.x === "number") out.x = el.x;
  } catch (e3) {}
  try {
    if (typeof el.y === "number") out.y = el.y;
  } catch (e4) {}
  try {
    if (typeof el.width === "number") out.width = el.width;
  } catch (e5) {}
  try {
    if (typeof el.height === "number") out.height = el.height;
  } catch (e6) {}
  try {
    if (typeof el.rotation === "number") out.rotationDeg = el.rotation;
  } catch (e7) {}
  try {
    if (el.libraryItem && el.libraryItem.name) out.libraryItemName = String(el.libraryItem.name);
  } catch (e8) {}
  try {
    if (el.symbolType !== undefined) out.symbolType = String(el.symbolType);
  } catch (e9) {}
  try {
    if (el.instanceType !== undefined) out.instanceType = String(el.instanceType);
  } catch (e10) {}
  try {
    if (el.colorMode !== undefined) out.colorMode = String(el.colorMode);
  } catch (e11) {}
  try {
    if (typeof el.alphaMultiplier === "number") out.alphaMultiplier = el.alphaMultiplier;
  } catch (e12) {}
  try {
    if (typeof el.alpha === "number") out.alpha = el.alpha;
  } catch (e13) {}
  if (includeMatrix) {
    var mm = snapshotMatrix(el);
    if (mm) out.matrix = mm;
  }
  return out;
}

function cmdExportFrameSnapshot(args) {
  if (!args.outputPathPlatform) throw new Error("outputPathPlatform required.");
  var uri = FLfile.platformPathToURI(String(args.outputPathPlatform).replace(/\\/g, "/"));
  var dom = findDom(args);
  var prevTimeline = dom.currentTimeline;
  var tlPrev = dom.getTimeline();
  var prevFrame = tlPrev.currentFrame;
  try {
    applyScene(dom, args);
    var tl = dom.getTimeline();
    var fi = frameUiToIdx(Number(args.frameNumber));
    if (fi < 0 || fi >= tl.frameCount) {
      throw new Error("frameNumber out of range for timeline.");
    }
    tl.currentFrame = fi;
    var fmt = args.format ? String(args.format).toUpperCase() : "PNG";
    if (fmt === "PNG") {
      dom.exportPNG(uri);
    } else if (fmt === "SVG") {
      dom.exportSVG(uri, true);
    } else {
      throw new Error("unsupported format");
    }
    return {
      ok: true,
      format: fmt,
      frameNumber: Number(args.frameNumber),
      outputPathPlatform: String(args.outputPathPlatform),
      uri: uri
    };
  } finally {
    dom.currentTimeline = prevTimeline;
    var tlRestore = dom.getTimeline();
    tlRestore.currentFrame = prevFrame;
  }
}

function routeCommand(cmd, args) {
  if (cmd === "animate_list_documents") return cmdListDocuments();
  if (cmd === "animate_get_document_info") return cmdGetDocInfo(args);
  if (cmd === "animate_create_document") return cmdCreateDoc(args);
  if (cmd === "animate_open_document") return cmdOpenDoc(args);
  if (cmd === "animate_save_document") return cmdSaveDoc(args);
  if (cmd === "animate_close_document") return cmdCloseDoc(args);
  if (cmd === "animate_publish_document") return cmdPublish(args);
  if (cmd === "animate_export_document") return cmdExport(args);
  if (cmd === "animate_export_frame_snapshot") return cmdExportFrameSnapshot(args);

  if (cmd === "animate_list_scenes") return cmdListScenes(args);
  if (cmd === "animate_add_scene") return cmdAddScene(args);
  if (cmd === "animate_rename_scene") return cmdRenameScene(args);
  if (cmd === "animate_set_active_scene") return cmdSetScene(args);

  if (cmd === "animate_list_layers") return cmdListLayers(args);
  if (cmd === "animate_create_layer") return cmdCreateLayer(args);
  if (cmd === "animate_rename_layer") return cmdRenameLayer(args);
  if (cmd === "animate_reorder_layer") return cmdReorderLayer(args);
  if (cmd === "animate_delete_layer") return cmdDeleteLayer(args);
  if (cmd === "animate_set_layer_properties") return cmdLayerProps(args);

  if (cmd === "animate_list_frames") return cmdListFrames(args);
  if (cmd === "animate_insert_frame") return cmdInsertFrames(args);
  if (cmd === "animate_insert_keyframe") return cmdInsKf(args);
  if (cmd === "animate_insert_blank_keyframe") return cmdInsBlankKf(args);
  if (cmd === "animate_clear_frames") return cmdClearFrames(args);
  if (cmd === "animate_set_frame_label") return cmdFrameLabel(args);
  if (cmd === "animate_set_frame_action_script") return cmdFrameScript(args);
  if (cmd === "animate_create_classic_tween") return cmdClassicTween(args);
  if (cmd === "animate_create_motion_tween") return cmdMotionTween(args);

  if (cmd === "animate_list_library_items") return cmdLibList(args);
  if (cmd === "animate_create_symbol_from_selection") return cmdSymFromSel(args);
  if (cmd === "animate_create_empty_symbol") return cmdSymEmpty(args);
  if (cmd === "animate_place_library_item") return cmdLibPlace(args);
  if (cmd === "animate_rename_library_item") return cmdLibRename(args);
  if (cmd === "animate_delete_library_item") return cmdLibDelete(args);
  if (cmd === "animate_create_library_folder") return cmdLibFolder(args);

  if (cmd === "animate_create_text") return cmdText(args);
  if (cmd === "animate_create_rectangle") return cmdRect(args);
  if (cmd === "animate_create_oval") return cmdOval(args);
  if (cmd === "animate_create_line") return cmdLine(args);
  if (cmd === "animate_set_element_properties") return cmdElemProps(args);
  if (cmd === "animate_set_filters") return cmdFilters(args);
  if (cmd === "animate_select_elements") return cmdSelect(args);
  if (cmd === "animate_delete_selection") return cmdDeleteSel(args);
  if (cmd === "animate_list_frame_elements") return cmdListFrameElements(args);
  if (cmd === "animate_get_element_properties") return cmdGetElementProperties(args);

  if (cmd === "animate_run_named_script") return cmdNamedScript(args);
  throw new Error("Unknown command: " + cmd);
}

function cmdListDocuments() {
  var out = [];
  for (var i = 0; i < fl.documents.length; i++) {
    var d = fl.documents[i];
    out.push({
      name: d.name,
      pathURI: d.pathURI || "",
      width: d.width,
      height: d.height,
      frameRate: d.frameRate
    });
  }
  return { documents: out };
}

function cmdGetDocInfo(args) {
  var dom = findDom(args);
  var scenes = [];
  for (var s = 0; s < dom.timelines.length; s++) {
    scenes.push({
      sceneIndexUi: s + 1,
      name: dom.timelines[s].name || "",
      layerCount: dom.timelines[s].layers.length
    });
  }
  return {
    name: dom.name,
    width: dom.width,
    height: dom.height,
    frameRate: dom.frameRate,
    scenes: scenes
  };
}

function cmdCreateDoc(args) {
  var profile = args && args.profile ? String(args.profile) : "HTML Canvas";
  fl.createDocument(profile);
  var dom = fl.getDocumentDOM();
  if (args && args.width) dom.width = args.width;
  if (args && args.height) dom.height = args.height;
  if (args && args.frameRate) dom.frameRate = args.frameRate;
  if (args && args.backgroundColorHex) {
    try {
      dom.backgroundColor = args.backgroundColorHex;
    } catch (eBg) {}
  }
  return { name: dom.name, width: dom.width, height: dom.height };
}

function cmdOpenDoc(args) {
  if (!args.fileUri) throw new Error("fileUri required.");
  fl.openDocument(String(args.fileUri));
  return { name: fl.getDocumentDOM().name };
}

function cmdSaveDoc(args) {
  var dom = findDom(args);
  if (args.saveAsPlatformPath) {
    var u = FLfile.platformPathToURI(String(args.saveAsPlatformPath).replace(/\\/g, "/"));
    dom.save(u);
    return { saveAsURI: u };
  }
  dom.save();
  return { savedInPlace: true };
}

function cmdCloseDoc(args) {
  findDom(args).close(true);
  return { closed: true };
}

function cmdPublish(args) {
  findDom(args).publish();
  return { published: true };
}

function cmdExport(args) {
  if (!args.outputPathPlatform) throw new Error("outputPathPlatform required.");
  var uri = FLfile.platformPathToURI(String(args.outputPathPlatform).replace(/\\/g, "/"));
  var dom = findDom(args);
  var fmt = args.format ? String(args.format) : "PNG";
  if (fmt === "PNG") {
    dom.exportPNG(uri);
  } else if (fmt === "SVG") {
    dom.exportSVG(uri, true);
  } else if (fmt === "SWF") {
    dom.exportSWF(uri, true);
  } else if (fmt === "VIDEO") {
    dom.exportVideo(Number(args.clipStart) || 0, Number(args.clipStop) || 0, uri);
  } else throw new Error("unsupported format");
  return { exported: fmt, uri: uri };
}

function cmdListScenes(args) {
  var dom = findDom(args);
  var scenes = [];
  for (var s = 0; s < dom.timelines.length; s++) {
    scenes.push({ sceneIndexUi: s + 1, name: dom.timelines[s].name });
  }
  return { scenes: scenes };
}

function cmdAddScene(args) {
  var dom = findDom(args);
  dom.addNewScene();
  return { sceneCount: dom.timelines.length };
}

function cmdRenameScene(args) {
  var dom = findDom(args);
  var idx = Number(args.sceneIndex) - 1;
  dom.timelines[idx].name = String(args.newSceneName);
  return { sceneIndexUi: args.sceneIndex, name: args.newSceneName };
}

function cmdSetScene(args) {
  var dom = findDom(args);
  dom.currentTimeline = Number(args.sceneIndex) - 1;
  return { activeSceneIndexUi: args.sceneIndex };
}

function cmdListLayers(args) {
  var dom = findDom(args);
  var tl = applyScene(dom, args);
  var arr = [];
  for (var i = 0; i < tl.layers.length; i++) {
    arr.push({
      layerIndexUi: i + 1,
      name: tl.layers[i].name,
      layerType: tl.layers[i].layerType,
      visible: tl.layers[i].visible,
      locked: tl.layers[i].locked
    });
  }
  return { layers: arr };
}

function cmdCreateLayer(args) {
  var dom = findDom(args);
  var tl = applyScene(dom, args);
  tl.addNewLayer(String(args.name || "Layer"));
  if (args.layerType) {
    try {
      tl.layers[0].layerType = String(args.layerType);
    } catch (eLt) {}
  }
  return { ok: true };
}

function cmdRenameLayer(args) {
  var tl = applyScene(findDom(args), args);
  var li = layerIndexFromUi(tl, args.layerIndex, args.layerName);
  tl.layers[li].name = String(args.newName);
  return { ok: true };
}

function cmdReorderLayer(args) {
  return {
    note:
      "Layer reorder is sensitive to Timeline API deltas. Prefer UI reorder or tailor bridge.jsfl for your Animate CC build."
  };
}

function cmdDeleteLayer(args) {
  var tl = applyScene(findDom(args), args);
  var li = layerIndexFromUi(tl, args.layerIndex, args.layerName);
  tl.deleteLayer(li);
  return { ok: true };
}

function cmdLayerProps(args) {
  var tl = applyScene(findDom(args), args);
  var li = layerIndexFromUi(tl, args.layerIndex, args.layerName);
  var lay = tl.layers[li];
  if (args.visible !== undefined) lay.visible = !!args.visible;
  if (args.locked !== undefined) lay.locked = !!args.locked;
  if (args.color) lay.color = String(args.color);
  return { ok: true };
}

function cmdListFrames(args) {
  var tl = applyScene(findDom(args), args);
  var layer = tl.layers[layerIndexFromUi(tl, args.layerIndex, args.layerName)];
  var start = args.startFrameNumber ? frameUiToIdx(Number(args.startFrameNumber)) : 0;
  var count = args.frameCount ? Number(args.frameCount) : 5;
  var framesOut = [];
  for (var f = start; f < Math.min(layer.frames.length, start + count); f++) {
    framesOut.push({ frameUi: f + 1, duration: layer.frames[f].duration, name: layer.frames[f].name });
  }
  return { frames: framesOut };
}

function timelineLayerIndexZeroBased(tl, args) {
  var ui = args.layerIndex !== undefined && args.layerIndex !== null ? Number(args.layerIndex) : 1;
  return layerIndexFromUi(tl, ui, args.layerName);
}

/**
 * Resolve scene + layer + frame.elements[] using same targeting as cmdElemProps.
 * Requires args.frameNumber (1-based UI frame).
 */
function resolveLayerFrameElements(dom, args) {
  var tl = applyScene(dom, args);
  var sceneIndexUi = dom.currentTimeline + 1;
  var li = timelineLayerIndexZeroBased(tl, args);
  var fi = frameUiToIdx(Number(args.frameNumber));
  var layerObj = tl.layers[li];
  if (fi < 0 || fi >= layerObj.frames.length) {
    throw new Error("frameNumber out of range for layer.");
  }
  var els = layerObj.frames[fi].elements;
  return {
    sceneIndexUi: sceneIndexUi,
    layerIndexUi: li + 1,
    layerName: layerObj.name ? String(layerObj.name) : "",
    frameNumberUi: Number(args.frameNumber),
    elementsArray: els || []
  };
}

function cmdListFrameElements(args) {
  var dom = findDom(args);
  var ctx = resolveLayerFrameElements(dom, args);
  var includeMatrix =
    args.includeMatrix !== undefined && args.includeMatrix !== null ? !!args.includeMatrix : true;
  var outList = [];
  for (var i = 0; i < ctx.elementsArray.length; i++) {
    outList.push(snapshotElement(ctx.elementsArray[i], i, includeMatrix));
  }
  return {
    sceneIndex: ctx.sceneIndexUi,
    layerIndex: ctx.layerIndexUi,
    layerName: ctx.layerName,
    frameNumber: ctx.frameNumberUi,
    elements: outList
  };
}

function cmdGetElementProperties(args) {
  var dom = findDom(args);
  var ctx = resolveLayerFrameElements(dom, args);
  var ei =
    args.elementIndex !== undefined && args.elementIndex !== null ? Number(args.elementIndex) : NaN;
  if (isNaN(ei)) throw new Error("elementIndex required.");
  ei = Math.floor(ei);
  if (!ctx.elementsArray.length) {
    throw new Error("No elements on target layer at frame " + ctx.frameNumberUi + ".");
  }
  if (ei < 0 || ei >= ctx.elementsArray.length) {
    throw new Error("elementIndex out of range.");
  }
  var includeMatrix =
    args.includeMatrix !== undefined && args.includeMatrix !== null ? !!args.includeMatrix : true;
  return snapshotElement(ctx.elementsArray[ei], ei, includeMatrix);
}

function cmdInsertFrames(args) {
  var tl = applyScene(findDom(args), args);
  var count = Number(args.count) || 1;
  var idx = Number(args.atFrameIndexZeroBased);
  var allLayers = !!args.allLayers;
  if (!allLayers) {
    tl.currentLayer = timelineLayerIndexZeroBased(tl, args);
  }
  tl.insertFrames(count, allLayers, idx);
  return { ok: true };
}

function cmdInsKf(args) {
  var tl = applyScene(findDom(args), args);
  tl.currentLayer = timelineLayerIndexZeroBased(tl, args);
  tl.insertKeyframe(frameUiToIdx(Number(args.frameNumber)));
  return { ok: true };
}

function cmdInsBlankKf(args) {
  var tl = applyScene(findDom(args), args);
  tl.currentLayer = timelineLayerIndexZeroBased(tl, args);
  tl.insertBlankKeyframe(frameUiToIdx(Number(args.frameNumber)));
  return { ok: true };
}

function cmdClearFrames(args) {
  var tl = applyScene(findDom(args), args);
  tl.clearFrames(
    Number(args.startFrameNumber) ? frameUiToIdx(Number(args.startFrameNumber)) : 0,
    Number(args.endFrameNumber) ? frameUiToIdx(Number(args.endFrameNumber)) : 1
  );
  return { ok: true };
}

function cmdFrameLabel(args) {
  var tl = applyScene(findDom(args), args);
  var lyr = tl.layers[layerIndexFromUi(tl, args.layerIndex, args.layerName)];
  lyr.frames[frameUiToIdx(Number(args.frameNumber))].name = String(args.label || "");
  return { ok: true };
}

function cmdFrameScript(args) {
  var tl = applyScene(findDom(args), args);
  tl.layers[layerIndexFromUi(tl, args.layerIndex, args.layerName)].frames[frameUiToIdx(Number(args.frameNumber))].actionScript =
    String(args.script || "");
  return { ok: true };
}

function cmdClassicTween(args) {
  var tl = applyScene(findDom(args), args);
  tl.currentLayer = timelineLayerIndexZeroBased(tl, args);
  tl.createMotionTween(frameUiToIdx(Number(args.startFrameNumber)));
  return { kind: "classic" };
}

function cmdMotionTween(args) {
  var tl = applyScene(findDom(args), args);
  tl.currentLayer = timelineLayerIndexZeroBased(tl, args);
  try {
    tl.createMotionObject();
    return { kind: "motion" };
  } catch (em) {
    return { hint: String(em), note: "createMotionObject often requires tweenable symbol selection spanning frames." };
  }
}

function cmdLibList(args) {
  var lib = findDom(args).library;
  var keys = [];
  for (var i = 0; i < lib.items.length; i++) {
    keys.push(lib.items[i].name);
  }
  return { items: keys };
}

function cmdSymFromSel(args) {
  var dom = findDom(args);
  dom.convertToSymbol(String(args.symbolType || "movie clip"), "center", String(args.name || "symbol"));
  return { ok: true };
}

function cmdSymEmpty(args) {
  var dom = findDom(args);
  dom.library.addNewItem(String(args.symbolType || "movie clip"), String(args.name || "Symbol"));
  return { ok: true };
}

function cmdLibPlace(args) {
  var dom = findDom(args);
  var tlPlace = applyScene(dom, args);
  if (args.layerIndex !== undefined || args.layerName) {
    tlPlace.currentLayer = timelineLayerIndexZeroBased(tlPlace, args);
  }
  /** Library placement follows timeline playhead; pin to frame 1 unless caller sets current frame elsewhere. */
  var pinFrame = args.frameNumber !== undefined && args.frameNumber !== null ? frameUiToIdx(Number(args.frameNumber)) : 0;
  if (pinFrame >= 0 && pinFrame < tlPlace.frameCount) {
    tlPlace.currentFrame = pinFrame;
  }
  var pt = { x: Number(args.x) || 0, y: Number(args.y) || 0 };
  dom.library.addItemToDocument(pt, String(args.libraryPath));
  return { ok: true };
}

function cmdLibRename(args) {
  var dom = findDom(args);
  dom.library.renameItem(String(args.libraryPath), String(args.newName));
  return { ok: true };
}

function cmdLibDelete(args) {
  findDom(args).library.deleteItem(String(args.libraryPath));
  return { ok: true };
}

function cmdLibFolder(args) {
  findDom(args).library.newFolder(String(args.folderPath));
  return { ok: true };
}

function cmdText(args) {
  var dom = findDom(args);
  var r = args.width || 240;
  var b = args.height || 120;
  dom.addNewText(
    {
      left: Number(args.x) || 0,
      top: Number(args.y) || 0,
      right: (Number(args.x) || 0) + r,
      bottom: (Number(args.y) || 0) + b
    },
    typeof args.text === "string" ? args.text : "Text"
  );
  return { ok: true };
}

function cmdRect(args) {
  findDom(args).addNewRectangle(args.bounds, args.cornerRadius || 0);
  return { ok: true };
}

function cmdOval(args) {
  findDom(args).addNewOval(args.bounds);
  return { ok: true };
}

function cmdLine(args) {
  findDom(args).addNewLine({ x: args.from.x, y: args.from.y }, { x: args.to.x, y: args.to.y });
  return { ok: true };
}

function cmdElemProps(args) {
  var dom = findDom(args);
  /** Timeline element path: layer + 1-based frame + element index (no Stage selection). */
  var hasElemIdx =
    args.elementIndex !== undefined && args.elementIndex !== null && String(args.elementIndex) !== "";
  var elemIdxNum = hasElemIdx ? Number(args.elementIndex) : NaN;
  var frameNumHas = args.frameNumber !== undefined && args.frameNumber !== null && String(args.frameNumber) !== "";
  if (hasElemIdx && !isNaN(elemIdxNum) && frameNumHas) {
    var tlE = applyScene(dom, args);
    var liE = timelineLayerIndexZeroBased(tlE, args);
    var fiE = frameUiToIdx(Number(args.frameNumber));
    var layerE = tlE.layers[liE];
    if (fiE < 0 || fiE >= layerE.frames.length) {
      throw new Error("frameNumber out of range for layer.");
    }
    var elsE = layerE.frames[fiE].elements;
    if (!elsE || elsE.length === 0) {
      throw new Error("No elements on target layer at frame " + args.frameNumber + ".");
    }
    var eiE = Math.min(Math.max(0, Math.floor(elemIdxNum)), elsE.length - 1);
    var elE = elsE[eiE];
    if (args.x !== undefined) elE.x = args.x;
    if (args.y !== undefined) elE.y = args.y;
    if (args.width !== undefined) elE.width = args.width;
    if (args.height !== undefined) elE.height = args.height;
    if (args.rotationDeg !== undefined) elE.rotation = args.rotationDeg;
    if (args.name !== undefined) elE.name = String(args.name);
    return { ok: true };
  }
  if (hasElemIdx && !isNaN(elemIdxNum) && dom.selection && dom.selection.length) {
    /** selection index path */
    var el = dom.selection[Math.min(dom.selection.length - 1, Math.floor(elemIdxNum))];
    if (!el) throw new Error("No element.");
    if (args.x !== undefined) el.x = args.x;
    if (args.y !== undefined) el.y = args.y;
    if (args.width !== undefined) el.width = args.width;
    if (args.height !== undefined) el.height = args.height;
    if (args.rotationDeg !== undefined) el.rotation = args.rotationDeg;
    return { ok: true };
  }
  return { ok: false, hint: "Provide frameNumber+elementIndex (+ optional layer), or Stage selection." };
}

function cmdFilters(args) {
  var dom = findDom(args);
  if (args.filters) dom.setFilters(args.filters);
  return { ok: true };
}

function cmdSelect(args) {
  return {
    hint: "Prefer manual Stage selection when automating tween-heavy edits; scripted selection targets vary by Canvas vs AS3 timelines."
  };
}

function cmdDeleteSel(args) {
  findDom(args).deleteSelection();
  return { ok: true };
}

function cmdNamedScript(args) {
  if (!args || !args.scriptName) throw new Error("scriptName required.");
  /** Allowlisted smoke-test only in this reference build. */
  if (String(args.scriptName) !== "heartbeat_smoke_test") {
    throw new Error("Named script not wired: " + args.scriptName);
  }
  return { ran: args.scriptName, ok: true };
}

/**
 * Poll the queue folder for the next pending command file and process it.
 * Invoked from the CEP panel on a timer via: fl.runScript(bridgeUri,"pollOnePendingCommand", ctxJson)
 */
function pollOnePendingCommand(/* optional panel context JSON from CEP */) {
  try {
    if (arguments.length > 0 && arguments[0] !== undefined && arguments[0] !== null) {
      var rawPoll = String(arguments[0]);
      if (rawPoll.length > 0) {
        try {
          var ctxPoll = JSON.parse(rawPoll);
          if (ctxPoll && ctxPoll.bridgeQueueRootPlatform) {
            _bridgeQueueRootPlatform = String(ctxPoll.bridgeQueueRootPlatform)
              .replace(/\\/g, "/")
              .replace(/\/+$/, "");
          }
        } catch (ePollCtx) {}
      }
    }
    ensureBridgeDir();
    var folderUri = bridgeRootUri();
    if (!FLfile.exists(folderUri)) {
      return "no-dir";
    }
    var listing = FLfile.listFolder(folderUri, "files");
    if (!listing || listing.length === 0) {
      return "empty";
    }
    for (var i = 0; i < listing.length; i++) {
      var fname = listing[i];
      if (fname.indexOf("command-") !== 0) {
        continue;
      }
      if (fname.indexOf(".json") !== fname.length - 5) {
        continue;
      }
      var fullUri = folderUri + fname;
      var txt = FLfile.read(fullUri);
      if (!txt) {
        continue;
      }
      var env = JSON.parse(txt);
      if (env && env.status === "pending") {
        var platformPath = FLfile.uriToPlatformPath(fullUri);
        dispatchFromQueueFile(platformPath);
        return fname;
      }
    }
    return "idle";
  } catch (ePoll) {
    logLine("pollOnePendingCommand err: " + String(ePoll && ePoll.message ? ePoll.message : ePoll));
    return "error";
  }
}

function ensureBridgeDir() {
  var uri = bridgeRootUri();
  if (!FLfile.exists(uri)) {
    FLfile.createFolder(uri);
  }
}
