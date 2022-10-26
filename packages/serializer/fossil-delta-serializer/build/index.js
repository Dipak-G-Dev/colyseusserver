'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var fossilDelta = require('fossil-delta');
var msgpack = require('notepack.io');
var core = require('@colyseus/core');
var jsonPatch = require('fast-json-patch');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var fossilDelta__default = /*#__PURE__*/_interopDefaultLegacy(fossilDelta);
var msgpack__default = /*#__PURE__*/_interopDefaultLegacy(msgpack);
var jsonPatch__default = /*#__PURE__*/_interopDefaultLegacy(jsonPatch);

class FossilDeltaSerializer {
    id = 'fossil-delta';
    // when a new user connects, it receives the 'previousState', which holds
    // the last binary snapshot other users already have, therefore the patches
    // that follow will be the same for all clients.
    previousState;
    previousStateEncoded;
    patches;
    reset(newState) {
        this.previousState = newState;
        this.previousStateEncoded = msgpack__default['default'].encode(this.previousState);
    }
    getFullState(_) {
        return this.previousStateEncoded;
    }
    applyPatches(clients, previousState) {
        const hasChanged = this.hasChanged(previousState);
        if (hasChanged) {
            this.patches.unshift(core.Protocol.ROOM_STATE_PATCH);
            let numClients = clients.length;
            while (numClients--) {
                const client = clients[numClients];
                client.enqueueRaw(this.patches);
            }
        }
        return hasChanged;
    }
    hasChanged(newState) {
        const currentState = newState;
        let changed = false;
        let currentStateEncoded;
        /**
         * allow optimized state changes when using `Schema` class.
         */
        if (newState?.['$changes']) { // tslint:disable-line
            if (newState['$changes'].changes.size > 0) { // tslint:disable-line
                changed = true;
                currentStateEncoded = msgpack__default['default'].encode(currentState);
            }
        }
        else {
            currentStateEncoded = msgpack__default['default'].encode(currentState);
            changed = !currentStateEncoded.equals(this.previousStateEncoded);
        }
        if (changed) {
            this.patches = fossilDelta__default['default'].create(this.previousStateEncoded, currentStateEncoded);
            //
            // debugging
            //
            if (core.debugPatch.enabled) {
                core.debugPatch('%d bytes, %j', this.patches.length, jsonPatch__default['default'].compare(msgpack__default['default'].decode(this.previousStateEncoded), currentState));
            }
            this.previousState = currentState;
            this.previousStateEncoded = currentStateEncoded;
        }
        return changed;
    }
}

exports.FossilDeltaSerializer = FossilDeltaSerializer;
//# sourceMappingURL=index.js.map
