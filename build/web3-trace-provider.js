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

var _glob = require('glob');

var _glob2 = _interopRequireDefault(_glob);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _ethereumjsUtil = require('ethereumjs-util');

var _ethereumjsUtil2 = _interopRequireDefault(_ethereumjsUtil);

var _trace = require('./trace');

var _sourceMaps = require('./source-maps');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var REVERT_MESSAGE_ID = '0x08c379a0'; // first 4byte of keccak256('Error(string)').

var Web3TraceProvider = function () {
  function Web3TraceProvider(web3) {
    (0, _classCallCheck3.default)(this, Web3TraceProvider);

    this.web3 = web3;
    this.nextProvider = web3.currentProvider;
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
    value: function send() {
      var payload = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      return this.nextProvider.send(payload);
    }
  }, {
    key: 'sendAsync',
    value: function sendAsync(payload, cb) {
      var _this = this;

      if (payload.method === 'eth_sendTransaction' || payload.method === 'eth_call' || payload.method === 'eth_getTransactionReceipt') {
        var txData = payload.params[0];
        return this.nextProvider.sendAsync(payload, function (err, result) {
          if (_this._isGanacheErrorResponse(result)) {
            var txHash = result.result || (0, _keys2.default)(result.error.data)[0];
            if (_ethereumjsUtil2.default.toBuffer(txHash).length === 32) {
              var toAddress = txData.to;
              // record tx trace
              _this.recordTxTrace(toAddress, txHash, result, _this._isInvalidOpcode(result)).then(function (traceResult) {
                result.error.message += traceResult;
                cb(err, result);
              }).catch(function (traceError) {
                cb(traceError, result);
              });
            } else {
              console.warn('Could not trace REVERT / invalid opcode. maybe legacy node.');
              cb(err, result);
            }
          } else if (_this._isGethEthCallRevertResponse(payload.method, result)) {
            var messageBuf = _this.pickUpRevertReason(_ethereumjsUtil2.default.toBuffer(result.result));
            console.warn('VM Exception while processing transaction: revert. reason: ' + messageBuf.toString());
            cb(err, result);
          } else if (_this._isGethErrorReceiptResponse(payload.method, result)) {
            // record tx trace
            var _toAddress = result.result.to;
            var _txHash = result.result.transactionHash;
            _this.recordTxTrace(_toAddress, _txHash, result).then(function (traceResult) {
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

      return this.nextProvider.sendAsync(payload, cb);
    }

    /**
     * Check the response result is ganache-core response and has revert error.
     * @param  result Response data.
     * @return boolean
     */

  }, {
    key: '_isGanacheErrorResponse',
    value: function _isGanacheErrorResponse(result) {
      return result.error && result.error.message && (result.error.message.endsWith(': revert') || result.error.message.endsWith(': invalid opcode'));
    }

    /**
     * Check is invalid opcode error.
     * @param  result Response data.
     * @return boolean
     */

  }, {
    key: '_isInvalidOpcode',
    value: function _isInvalidOpcode(result) {
      return result.error.message.endsWith(': invalid opcode');
    }

    /**
     * Check the response result is go-ethereum response and has revert reason.
     * @param  method Request JSON-RPC method
     * @param  result Response data.
     * @return boolean
     */

  }, {
    key: '_isGethEthCallRevertResponse',
    value: function _isGethEthCallRevertResponse(method, result) {
      return method === 'eth_call' && result.result && result.result.startsWith(REVERT_MESSAGE_ID);
    }

    /**
     * Check the response result is go-ethereum transaction receipt response and it mark error.
     * @param  method Request JSON-RPC method
     * @param  result Response data.
     * @return boolean
     */

  }, {
    key: '_isGethErrorReceiptResponse',
    value: function _isGethErrorReceiptResponse(method, result) {
      return method === 'eth_getTransactionReceipt' && result.result && result.result.status === '0x0';
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
        _this2.nextProvider.sendAsync({
          id: new Date().getTime(),
          method: 'eth_getCode',
          params: [address]
        }, function (err, result) {
          if (err) {
            reject(err);
          } else {
            resolve(result.result);
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
        _this3.nextProvider.sendAsync({
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
    key: 'recordTxTrace',
    value: function () {
      var _ref = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee(address, txHash, result) {
        var isInvalid = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
        var trace, logs, evmCallStack;
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
                logs = trace === undefined ? [] : trace.structLogs;
                evmCallStack = (0, _trace.getRevertTrace)(logs, address);

                if (!(evmCallStack.length > 0)) {
                  _context.next = 10;
                  break;
                }

                return _context.abrupt('return', this.getStackTrace(evmCallStack));

              case 10:
                return _context.abrupt('return', this.getStackTranceSimple(address, txHash, result, isInvalid));

              case 11:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function recordTxTrace(_x4, _x5, _x6) {
        return _ref.apply(this, arguments);
      }

      return recordTxTrace;
    }()
  }, {
    key: 'getStackTranceSimple',
    value: function () {
      var _ref2 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee2(address, txHash, result) {
        var isInvalid = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
        var bytecode, contractData, bytecodeHex, sourceMap, pcToSourceRange, sourceRange, pc, errorType, traceArray;
        return _regenerator2.default.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                if (!this._contractsData) {
                  this._contractsData = this.collectContractsData();
                }
                _context2.next = 3;
                return this.getContractCode(address);

              case 3:
                bytecode = _context2.sent;
                contractData = this.getContractDataIfExists(this._contractsData.contractsData, bytecode);

                if (contractData) {
                  _context2.next = 9;
                  break;
                }

                console.warn('unknown contract address: ' + address + '.');
                console.warn('Maybe you try to \'rm build/contracts/* && truffle compile\' for reset sourceMap.');
                return _context2.abrupt('return', null);

              case 9:
                bytecodeHex = _ethereumjsUtil2.default.stripHexPrefix(bytecode);
                sourceMap = contractData.sourceMapRuntime;
                pcToSourceRange = (0, _sourceMaps.parseSourceMap)(this._contractsData.sourceCodes, sourceMap, bytecodeHex, this._contractsData.sources);
                sourceRange = void 0;
                pc = result.error.data[txHash].program_counter;
                // Sometimes there is not a mapping for this pc (e.g. if the revert
                // actually happens in assembly).

              case 14:
                if (sourceRange) {
                  _context2.next = 22;
                  break;
                }

                sourceRange = pcToSourceRange[pc];
                pc -= 1;

                if (!(pc <= 0)) {
                  _context2.next = 20;
                  break;
                }

                console.warn('could not find matching sourceRange for structLog: ' + result.error.data);
                return _context2.abrupt('return', null);

              case 20:
                _context2.next = 14;
                break;

              case 22:
                errorType = isInvalid ? 'invalid opcode' : 'REVERT';

                if (!sourceRange) {
                  _context2.next = 26;
                  break;
                }

                traceArray = [sourceRange.fileName, sourceRange.location.start.line, sourceRange.location.start.column].join(':');
                return _context2.abrupt('return', '\n\nStack trace for ' + errorType + ':\n' + traceArray + '\n');

              case 26:
                return _context2.abrupt('return', '\n\nCould not determine stack trace for ' + errorType + '\n');

              case 27:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function getStackTranceSimple(_x8, _x9, _x10) {
        return _ref2.apply(this, arguments);
      }

      return getStackTranceSimple;
    }()
  }, {
    key: 'getStackTrace',
    value: function () {
      var _ref3 = (0, _asyncToGenerator3.default)( /*#__PURE__*/_regenerator2.default.mark(function _callee3(evmCallStack) {
        var sourceRanges, index, evmCallStackEntry, isContractCreation, bytecode, contractData, errMsg, bytecodeHex, sourceMap, pcToSourceRange, sourceRange, pc, traceArray;
        return _regenerator2.default.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                sourceRanges = [];

                if (!this._contractsData) {
                  this._contractsData = this.collectContractsData();
                }

                index = 0;

              case 3:
                if (!(index < evmCallStack.length)) {
                  _context3.next = 34;
                  break;
                }

                evmCallStackEntry = evmCallStack[index];
                isContractCreation = evmCallStackEntry.address === _trace.constants.NEW_CONTRACT;

                if (!isContractCreation) {
                  _context3.next = 9;
                  break;
                }

                console.error('Contract creation not supported');
                return _context3.abrupt('continue', 31);

              case 9:
                _context3.next = 11;
                return this.getContractCode(evmCallStackEntry.address);

              case 11:
                bytecode = _context3.sent;
                contractData = this.getContractDataIfExists(this._contractsData.contractsData, bytecode);

                if (contractData) {
                  _context3.next = 17;
                  break;
                }

                errMsg = isContractCreation ? 'Unknown contract creation transaction' : 'Transaction to an unknown address: ' + evmCallStackEntry.address;

                console.warn(errMsg);
                return _context3.abrupt('continue', 31);

              case 17:
                bytecodeHex = _ethereumjsUtil2.default.stripHexPrefix(bytecode);
                sourceMap = isContractCreation ? contractData.sourceMap : contractData.sourceMapRuntime;
                pcToSourceRange = (0, _sourceMaps.parseSourceMap)(this._contractsData.sourceCodes, sourceMap, bytecodeHex, this._contractsData.sources);
                sourceRange = void 0;
                pc = evmCallStackEntry.structLog.pc;
                // Sometimes there is not a mapping for this pc (e.g. if the revert
                // actually happens in assembly). In that case, we want to keep
                // searching backwards by decrementing the pc until we find a
                // mapped source range.

              case 22:
                if (sourceRange) {
                  _context3.next = 30;
                  break;
                }

                sourceRange = pcToSourceRange[pc];
                pc -= 1;

                if (!(pc <= 0)) {
                  _context3.next = 28;
                  break;
                }

                console.warn('could not find matching sourceRange for structLog: ' + evmCallStackEntry.structLog);
                return _context3.abrupt('continue', 22);

              case 28:
                _context3.next = 22;
                break;

              case 30:
                sourceRanges.push(sourceRange);

              case 31:
                index++;
                _context3.next = 3;
                break;

              case 34:
                if (!(sourceRanges.length > 0)) {
                  _context3.next = 37;
                  break;
                }

                traceArray = sourceRanges.map(function (sourceRange) {
                  return [sourceRange.fileName, sourceRange.location.start.line, sourceRange.location.start.column].join(':');
                });
                return _context3.abrupt('return', '\n\nStack trace for REVERT:\n' + traceArray.reverse().join('\n') + '\n');

              case 37:
                return _context3.abrupt('return', '\n\nCould not determine stack trace for REVERT\n');

              case 38:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      function getStackTrace(_x11) {
        return _ref3.apply(this, arguments);
      }

      return getStackTrace;
    }()
  }, {
    key: 'collectContractsData',
    value: function collectContractsData() {
      var artifactsGlob = 'build/contracts/**/*.json';
      var artifactFileNames = _glob2.default.sync(artifactsGlob, { absolute: true });
      var contractsData = [];
      var sources = [];
      artifactFileNames.forEach(function (artifactFileName) {
        var artifact = JSON.parse(_fs2.default.readFileSync(artifactFileName).toString());

        // If the sourcePath starts with zeppelin, then prepend with the pwd and node_modules
        if (new RegExp('^(open)?zeppelin-solidity').test(artifact.sourcePath)) {
          artifact.sourcePath = process.env.PWD + '/node_modules/' + artifact.sourcePath;
        }
        sources.push({
          artifactFileName: artifactFileName,
          id: artifact.ast.id,
          sourcePath: artifact.sourcePath
        });

        if (!artifact.bytecode) {
          console.warn(artifactFileName + ' doesn\'t contain bytecode. Skipping...');
          return;
        }

        var contractData = {
          artifactFileName: artifactFileName,
          sourceCodes: sourceCodes,
          sources: sources,
          bytecode: artifact.bytecode,
          sourceMap: artifact.sourceMap,
          runtimeBytecode: artifact.deployedBytecode,
          sourceMapRuntime: artifact.deployedSourceMap
        };
        contractsData.push(contractData);
      });
      sources = sources.sort(function (a, b) {
        return parseInt(a.id, 10) - parseInt(b.id, 10);
      });
      var sourceCodes = sources.map(function (source) {
        return _fs2.default.readFileSync(source.sourcePath).toString();
      });
      return {
        contractsData: contractsData,
        sourceCodes: sourceCodes,
        sources: sources.map(function (s) {
          return s.sourcePath;
        })
      };
    }
  }, {
    key: 'getContractDataIfExists',
    value: function getContractDataIfExists(contractsData, bytecode) {
      var _this4 = this;

      if (!bytecode.startsWith('0x')) {
        throw new Error('0x hex prefix missing: ' + bytecode);
      }

      var contractData = contractsData.find(function (contractDataCandidate) {
        var bytecodeRegex = _this4.bytecodeToBytecodeRegex(contractDataCandidate.bytecode);
        var runtimeBytecodeRegex = _this4.bytecodeToBytecodeRegex(contractDataCandidate.runtimeBytecode);
        if (contractDataCandidate.bytecode.length === 2 || contractDataCandidate.runtimeBytecode.length === 2) {
          return false;
        }

        // We use that function to find by bytecode or runtimeBytecode. Those are quasi-random strings so
        // collisions are practically impossible and it allows us to reuse that code
        return bytecode === contractDataCandidate.bytecode || bytecode === contractDataCandidate.runtimeBytecode || new RegExp('' + bytecodeRegex, 'g').test(bytecode) || new RegExp('' + runtimeBytecodeRegex, 'g').test(bytecode);
      });

      return contractData;
    }
  }, {
    key: 'bytecodeToBytecodeRegex',
    value: function bytecodeToBytecodeRegex(bytecode) {
      var bytecodeRegex = bytecode
      // Library linking placeholder: __ConvertLib____________________________
      .replace(/_.*_/, '.*')
      // Last 86 characters is solidity compiler metadata that's different between compilations
      .replace(/.{86}$/, '')
      // Libraries contain their own address at the beginning of the code and it's impossible to know it in advance
      .replace(/^0x730000000000000000000000000000000000000000/, '0x73........................................');
      // HACK: Node regexes can't be longer that 32767 characters. Contracts bytecode can. We just truncate the regexes. It's safe in practice.
      var MAX_REGEX_LENGTH = 32767;
      var truncatedBytecodeRegex = bytecodeRegex.slice(0, MAX_REGEX_LENGTH);
      return truncatedBytecodeRegex;
    }
  }]);
  return Web3TraceProvider;
}();

exports.default = Web3TraceProvider;
module.exports = exports['default'];