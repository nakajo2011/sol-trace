'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _regenerator = require('babel-runtime/regenerator');

var _regenerator2 = _interopRequireDefault(_regenerator);

var _asyncToGenerator2 = require('babel-runtime/helpers/asyncToGenerator');

var _asyncToGenerator3 = _interopRequireDefault(_asyncToGenerator2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _ethereumjsUtil = require('ethereumjs-util');

var _ethereumjsUtil2 = _interopRequireDefault(_ethereumjsUtil);

var _abiDecodeFunctions = require('abi-decode-functions');

var _abiDecodeFunctions2 = _interopRequireDefault(_abiDecodeFunctions);

var _trace = require('./trace');

var _sourceMaps = require('./source-maps');

var _assembler_info_provider = require('./assembler_info_provider');

var _assembler_info_provider2 = _interopRequireDefault(_assembler_info_provider);

var _error_response_capture = require('./error_response_capture');

var _error_response_capture2 = _interopRequireDefault(_error_response_capture);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Web3TraceProvider = function () {
  function Web3TraceProvider(web3) {
    (0, _classCallCheck3.default)(this, Web3TraceProvider);

    this.web3 = web3;
    this.nextProvider = web3.currentProvider;
    this.assemblerInfoProvider = new _assembler_info_provider2.default();
    this.contractCodes = {};
  }

  /**
   * Should be called to make sync request
   *
   * @method send
   * @param {Object} payload
   * @return {Object} result
   */


  (0, _createClass3.default)(Web3TraceProvider, [{
    key: 'send',
    value: function send(payload) {
      var cb = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : function () {};

      return this.nextProvider.send(payload, cb);
    }
  }, {
    key: 'sendAsync',
    value: function sendAsync(payload, cb) {
      var _this = this;

      var errorResCap = new _error_response_capture2.default(payload);
      if (errorResCap.isTargetMethod()) {
        var txData = payload.params[0];
        return this.nextProvider[this.nextProvider.sendAsync ? 'sendAsync' : 'send'](payload, function (err, result) {
          errorResCap.parseResponse(result);
          if (errorResCap.isGanacheError) {
            var txHash = result.result || (0, _keys2.default)(result.error.data)[0];
            if (_ethereumjsUtil2.default.toBuffer(txHash).length === 32) {
              var toAddress = txData.to;
              // record tx trace
              _this.recordTxTrace(toAddress, txHash, result, _this.getFunctionId(payload), errorResCap.isInvaliding).then(function (traceResult) {
                result.error.message += traceResult;
                cb(err, result);
              }).catch(function (traceError) {
                cb(traceError, result);
              });
            } else {
              cb(new Error('Could not trace REVERT / invalid opcode. maybe legacy node.'), result);
            }
          } else if (errorResCap.isGethError && errorResCap.isEthCallMethod()) {
            var messageBuf = _this.pickUpRevertReason(_ethereumjsUtil2.default.toBuffer(result.result));
            console.warn('VM Exception while processing transaction: revert. reason: ' + messageBuf.toString());
            cb(err, result);
          } else if (errorResCap.isGethError && errorResCap.isGetTransactionReceipt()) {
            // record tx trace
            var _toAddress = result.result.to;
            var _txHash = result.result.transactionHash;
            _this.recordTxTrace(_toAddress, _txHash, result, _this.getFunctionId(payload)).then(function (traceResult) {
              console.warn(traceResult);
              cb(err, result);
            }).catch(function (traceError) {
              cb(traceError, result);
            });
          } else {
            cb(err, result);
          }
        });
      }

      return this.nextProvider[this.nextProvider.sendAsync ? 'sendAsync' : 'send'](payload, cb);
    }

    /**
     * Pick up revert reason
     * @param  returndata Return data of evm that in contains eth_call response.
     * @return revert reason message
     */

  }, {
    key: 'pickUpRevertReason',
    value: function pickUpRevertReason(returndata) {
      if (returndata instanceof String) {
        returndata = _ethereumjsUtil2.default.toBuffer(returndata, 'hex');
      } else if (!(returndata instanceof Buffer)) {
        throw new Error('returndata is MUST hex String or Buffer.');
      }
      if (returndata.length < 4 + 32 + 32 + 32) {
        //  4: method id
        // 32: abi encode header
        // 32: string length
        // 32: string body(min)
        throw new Error('returndata.length is MUST 100+.');
      }
      var dataoffset = _ethereumjsUtil2.default.bufferToInt(returndata.slice(4).slice(0, 32));
      var abiencodedata = returndata.slice(36);
      var stringBody = abiencodedata.slice(dataoffset);
      var length = _ethereumjsUtil2.default.bufferToInt(abiencodedata.slice(0, 32));
      return stringBody.slice(0, length);
    }

    /**
     * Gets the contract code by address
     * @param  address Address of the contract
     * @return Code of the contract
     */

  }, {
    key: 'getContractCode',
    value: function getContractCode(address) {
      var _this2 = this;

      return new _promise2.default(function (resolve, reject) {
        if (address === _trace.constants.NEW_CONTRACT) {
          return reject(new Error('Contract Creation is not supporte.'));
        } else if (_this2.contractCodes[address]) {
          return resolve(_this2.contractCodes[address]);
        }
        _this2.nextProvider[_this2.nextProvider.sendAsync ? 'sendAsync' : 'send']({
          id: new Date().getTime(),
          method: 'eth_getCode',
          params: [address]
        }, function (err, result) {
          if (err) {
            reject(err);
          } else {
            _this2.contractCodes[address] = result.result;
            resolve(_this2.contractCodes[address]);
          }
        });
      });
    }

    /**
     * Gets the debug trace of a transaction
     * @param  nextId Next request ID of JSON-RPC.
     * @param  txHash Hash of the transactuon to get a trace for
     * @param  traceParams Config object allowing you to specify if you need memory/storage/stack traces.
     * @return Transaction trace
     */

  }, {
    key: 'getTransactionTrace',
    value: function getTransactionTrace(nextId, txHash) {
      var _this3 = this;

      var traceParams = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

      return new _promise2.default(function (resolve, reject) {
        _this3.nextProvider[_this3.nextProvider.sendAsync ? 'sendAsync' : 'send']({
          id: nextId,
          method: 'debug_traceTransaction',
          params: [txHash, traceParams]
        }, function (err, result) {
          if (err) {
            reject(err);
          } else {
            resolve(result.result);
          }
        });
      });
    }
  }, {
    key: 'extractEvmCallStack',
    value: function extractEvmCallStack(trace, address) {
      var logs = trace === undefined || trace.structLogs === undefined ? [] : trace.structLogs;
      return (0, _trace.getRevertTrace)(logs, address);
    }

    /**
     * recording trace that start point, call and revert opcode point from debug trace.
     * @param address
     * @param txHash
     * @param result
     * @param functionId
     * @param isInvalid
     * @return {Promise<*>}
     */

  }, {
    key: 'recordTxTrace',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(address, txHash, result, functionId) {
        var isInvalid = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;
        var trace, evmCallStack, opcodes, decoder, startPointStack;
        return _regenerator2.default.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                address = !address || address === '0x0' ? _trace.constants.NEW_CONTRACT : address;
                _context.next = 3;
                return this.getTransactionTrace(result.id + 1, txHash, {
                  disableMemory: true,
                  disableStack: false,
                  disableStorage: true
                });

              case 3:
                trace = _context.sent;
                evmCallStack = this.extractEvmCallStack(trace, address);
                _context.next = 7;
                return this.getContractCode(address);

              case 7:
                opcodes = _context.sent;
                decoder = new _abiDecodeFunctions2.default(opcodes);
                // create function call point stack

                startPointStack = {
                  address: address,
                  structLog: {
                    pc: decoder.findProgramCounter(functionId),
                    type: 'call start point'
                  }
                };

                evmCallStack.unshift(startPointStack);
                if (evmCallStack.length === 1) {
                  // if length === 1, it did not get debug_traceTransaction, because it error happens in eth_call.
                  // so that, we create callStack from RPC response that is program counter of REVERT / invalid.
                  evmCallStack.push(this.createCallStackFromResponse(address, txHash, result, isInvalid));
                }
                // if getRevertTrace returns a call stack it means there was a
                // revert.
                return _context.abrupt('return', this.getStackTrace(evmCallStack));

              case 13:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function recordTxTrace(_x4, _x5, _x6, _x7) {
        return _ref.apply(this, arguments);
      }

      return recordTxTrace;
    }()

    /**
     * trace info convert to stack trace info that is using assembly opcodes.
     * @param address
     * @param txHash
     * @param result
     * @param isInvalid
     * @return {Promise<*>}
     */

  }, {
    key: 'createCallStackFromResponse',
    value: function createCallStackFromResponse(address, txHash, result, isInvalid) {
      var pc = -1;
      if (result.error && result.error.data) {
        pc = result.error.data[txHash].program_counter;
        var errorStack = {
          address: address,
          structLog: {
            pc: pc,
            type: 'call ' + (isInvalid ? 'invalid' : 'revert') + ' point'
          }
        };
        return errorStack;
      } else {
        throw new Error('not supported data formart.');
      }
    }

    /**
     * trace info convert to stack trace info that is using call stack.
     * @param evmCallStack
     * @param functionId
     * @return {Promise<string>}
     */

  }, {
    key: 'getStackTrace',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(evmCallStack, functionId) {
        var _this4 = this;

        var sourceRanges, _loop, index, _ret, traceArray;

        return _regenerator2.default.wrap(function _callee2$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                sourceRanges = [];
                _loop = /*#__PURE__*/_regenerator2.default.mark(function _loop(index) {
                  var evmCallStackEntry, isContractCreation, bytecode, contractData, errMsg, bytecodeHex, sourceMap, pcToSourceRange, sourceRange, pc, msgParams;
                  return _regenerator2.default.wrap(function _loop$(_context2) {
                    while (1) {
                      switch (_context2.prev = _context2.next) {
                        case 0:
                          evmCallStackEntry = evmCallStack[index];
                          isContractCreation = evmCallStackEntry.address === _trace.constants.NEW_CONTRACT;

                          if (!isContractCreation) {
                            _context2.next = 5;
                            break;
                          }

                          console.error('Contract creation not supported');
                          return _context2.abrupt('return', 'continue');

                        case 5:
                          _context2.next = 7;
                          return _this4.getContractCode(evmCallStackEntry.address);

                        case 7:
                          bytecode = _context2.sent;
                          contractData = _this4.assemblerInfoProvider.getContractDataIfExists(bytecode);

                          if (contractData) {
                            _context2.next = 13;
                            break;
                          }

                          errMsg = isContractCreation ? 'Unknown contract creation transaction' : 'Transaction to an unknown address: ' + evmCallStackEntry.address;

                          console.warn(errMsg);
                          return _context2.abrupt('return', 'continue');

                        case 13:
                          bytecodeHex = _ethereumjsUtil2.default.stripHexPrefix(bytecode);
                          sourceMap = isContractCreation ? contractData.sourceMap : contractData.sourceMapRuntime;
                          pcToSourceRange = (0, _sourceMaps.parseSourceMap)(_this4.assemblerInfoProvider.sourceCodes, sourceMap, bytecodeHex, _this4.assemblerInfoProvider.sources);
                          sourceRange = void 0;
                          pc = evmCallStackEntry.structLog.pc;
                          // Sometimes there is not a mapping for this pc (e.g. if the revert
                          // actually happens in assembly). In that case, we want to keep
                          // searching backwards by decrementing the pc until we find a
                          // mapped source range.

                        case 18:
                          if (sourceRange) {
                            _context2.next = 27;
                            break;
                          }

                          sourceRange = pcToSourceRange[pc];
                          pc -= 1;

                          if (!(pc <= 0)) {
                            _context2.next = 25;
                            break;
                          }

                          msgParams = ['pc', 'op', 'type'].map(function (key) {
                            return key + ': ' + evmCallStackEntry.structLog[key];
                          });

                          console.warn('could not find matching sourceRange for structLog: ' + msgParams.join(', '));
                          return _context2.abrupt('break', 27);

                        case 25:
                          _context2.next = 18;
                          break;

                        case 27:
                          if (sourceRange) {
                            sourceRanges.push(sourceRange);
                          }

                        case 28:
                        case 'end':
                          return _context2.stop();
                      }
                    }
                  }, _loop, _this4);
                });
                index = 0;

              case 3:
                if (!(index < evmCallStack.length)) {
                  _context3.next = 11;
                  break;
                }

                return _context3.delegateYield(_loop(index), 't0', 5);

              case 5:
                _ret = _context3.t0;

                if (!(_ret === 'continue')) {
                  _context3.next = 8;
                  break;
                }

                return _context3.abrupt('continue', 8);

              case 8:
                index++;
                _context3.next = 3;
                break;

              case 11:
                if (!(sourceRanges.length > 0)) {
                  _context3.next = 14;
                  break;
                }

                traceArray = sourceRanges.map(function (sourceRange) {
                  return [sourceRange.fileName, sourceRange.location.start.line, sourceRange.location.start.column].join(':');
                });
                return _context3.abrupt('return', '\n\nStack trace for REVERT:\n' + traceArray.reverse().join('\n') + '\n');

              case 14:
                return _context3.abrupt('return', '\n\nCould not determine stack trace for REVERT\n');

              case 15:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee2, this);
      }));

      function getStackTrace(_x8, _x9) {
        return _ref2.apply(this, arguments);
      }

      return getStackTrace;
    }()

    /**
     * extract function id from transaction data part.
     * @param payload
     * @return {*}
     */

  }, {
    key: 'getFunctionId',
    value: function getFunctionId(payload) {
      var funcId = payload.params[0].data;
      if (funcId && funcId.length > 10) {
        funcId = funcId.slice(0, 10);
      }
      return funcId;
    }
  }]);
  return Web3TraceProvider;
}();

exports.default = Web3TraceProvider;
module.exports = exports['default'];