'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

class NoneSerializer {
    id = 'none';
    reset(data) {
        // tslint:disable-line
    }
    getFullState(client) {
        return null;
    }
    applyPatches(clients, state) {
        return false;
    }
}

exports.NoneSerializer = NoneSerializer;
//# sourceMappingURL=NoneSerializer.js.map
