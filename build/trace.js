'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getPcToInstructionIndexMapping = exports.OpCode = exports.constants = undefined;

var _extends2 = require('babel-runtime/helpers/extends');

var _extends3 = _interopRequireDefault(_extends2);

exports.isCallLike = isCallLike;
exports.isEndOpcode = isEndOpcode;
exports.getAddressFromStackEntry = getAddressFromStackEntry;
exports.normalizeStructLogs = normalizeStructLogs;
exports.getRevertTrace = getRevertTrace;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*

Copyright 2017 ZeroEx Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/

/*
 Modified by Jaynti Kanani <jdkanani@matic.network>
*/

var constants = exports.constants = {
  NEW_CONTRACT: 'NEW_CONTRACT',
  PUSH1: 0x60,
  PUSH2: 0x61,
  PUSH32: 0x7f,
  TIMESTAMP: 0x42
};

var OpCode = exports.OpCode = {
  DelegateCall: 'DELEGATECALL',
  Revert: 'REVERT',
  Create: 'CREATE',
  Stop: 'STOP',
  Invalid: 'INVALID',
  CallCode: 'CALLCODE',
  StaticCall: 'STATICCALL',
  Return: 'RETURN',
  Call: 'CALL',
  SelfDestruct: 'SELFDESTRUCT'
};

function isCallLike(op) {
  return [OpCode.CallCode, OpCode.StaticCall, OpCode.Call, OpCode.DelegateCall].indexOf(op) >= 0;
}

function isEndOpcode(op) {
  return [OpCode.Return, OpCode.Stop, OpCode.Revert, OpCode.Invalid, OpCode.SelfDestruct].indexOf(op) >= 0;
}

function getAddressFromStackEntry(stackEntry) {
  return stackEntry;
}

var isPush = function isPush(inst) {
  return inst >= constants.PUSH1 && inst <= constants.PUSH32;
};
var pushDataLength = function pushDataLength(inst) {
  return inst - constants.PUSH1 + 1;
};
var instructionLength = function instructionLength(inst) {
  return isPush(inst) ? pushDataLength(inst) + 1 : 1;
};
var getPcToInstructionIndexMapping = exports.getPcToInstructionIndexMapping = function getPcToInstructionIndexMapping(bytecode) {
  var result = {};
  var byteIndex = 0;
  var instructionIndex = 0;
  while (byteIndex < bytecode.length) {
    var instruction = bytecode[byteIndex];
    var length = instructionLength(instruction);
    result[byteIndex] = instructionIndex;
    byteIndex += length;
    instructionIndex += 1;
  }
  return result;
};

function normalizeStructLogs(structLogs) {
  if (structLogs[0].depth === 1) {
    // Geth uses 1-indexed depth counter whilst ganache starts from 0
    var newStructLogs = structLogs.map(function (structLog) {
      return (0, _extends3.default)({}, structLog, {
        depth: structLog.depth - 1
      });
    });
    return newStructLogs;
  }
  return structLogs;
}

function getRevertTrace(structLogs, startAddress) {
  var evmCallStack = [];
  var addressStack = [startAddress];
  if (structLogs.length === 0) {
    return [];
  }

  var normalizedStructLogs = normalizeStructLogs(structLogs);
  for (var i = 0; i < normalizedStructLogs.length; i++) {
    var structLog = normalizedStructLogs[i];
    if (structLog.depth !== addressStack.length - 1) {
      throw new Error("Malformed trace. Trace depth doesn't match call stack depth");
    }
    // After that check we have a guarantee that call stack is never empty
    // If it would: callStack.length - 1 === structLog.depth === -1
    // That means that we can always safely pop from it

    if (isCallLike(structLog.op)) {
      var currentAddress = addressStack[addressStack.length - 1];
      var jumpAddressOffset = 1;
      var newAddress = getAddressFromStackEntry(structLog.stack[structLog.stack.length - jumpAddressOffset - 1]);

      // Sometimes calls don't change the execution context (current address). When we do a transfer to an
      // externally owned account - it does the call and immediately returns because there is no fallback
      // function. We manually check if the call depth had changed to handle that case.
      var nextStructLog = normalizedStructLogs[i + 1];
      if (nextStructLog.depth !== structLog.depth) {
        addressStack.push(newAddress);
        evmCallStack.push({
          address: currentAddress,
          structLog: structLog
        });
      }
    } else if (isEndOpcode(structLog.op) && structLog.op !== OpCode.Revert) {
      // Just like with calls, sometimes returns/stops don't change the execution context (current address).
      var _nextStructLog = normalizedStructLogs[i + 1];
      if (!_nextStructLog || _nextStructLog.depth !== structLog.depth) {
        evmCallStack.pop();
        addressStack.pop();
      }

      if (structLog.op === OpCode.SelfDestruct) {
        // After contract execution, we look at all sub-calls to external contracts, and for each one, fetch
        // the bytecode and compute the coverage for the call. If the contract is destroyed with a call
        // to `selfdestruct`, we are unable to fetch it's bytecode and compute coverage.
        // TODO: Refactor this logic to fetch the sub-called contract bytecode before the selfdestruct is called
        // in order to handle this edge-case.
        console.warn("Detected a selfdestruct. This tool currently doesn't support that scenario.");
      }
    } else if (structLog.op === OpCode.Revert) {
      evmCallStack.push({
        address: addressStack[addressStack.length - 1],
        structLog: structLog
      });
      return evmCallStack;
    } else if (structLog.op === OpCode.Create) {
      // TODO: Extract the new contract address from the stack and handle that scenario
      console.warn("Detected a contract created from within another contract. This tool doesn't support that scenario");
      return [];
    } else {
      if (structLog !== normalizedStructLogs[normalizedStructLogs.length - 1]) {
        var _nextStructLog2 = normalizedStructLogs[i + 1];
        if (_nextStructLog2.depth === structLog.depth) {
          continue;
        } else if (_nextStructLog2.depth === structLog.depth - 1) {
          addressStack.pop();
        } else {
          throw new Error('Malformed trace. Unexpected call depth change');
        }
      }
    }
  }

  if (evmCallStack.length !== 0) {
    console.warn('Malformed trace. Call stack non empty at the end. (probably out of gas)');
  }
  return [];
}