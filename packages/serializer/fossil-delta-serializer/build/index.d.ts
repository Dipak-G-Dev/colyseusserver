import { Client, Serializer } from '@colyseus/core';
export declare class FossilDeltaSerializer<T> implements Serializer<T> {
    id: string;
    private previousState;
    private previousStateEncoded;
    private patches;
    reset(newState: T): void;
    getFullState(_?: Client): any;
    applyPatches(clients: Client[], previousState: T): boolean;
    hasChanged(newState: T): boolean;
}
