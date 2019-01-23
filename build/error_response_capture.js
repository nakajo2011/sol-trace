'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var METHOD_CALL = 'eth_call';
var METHOD_SEND_TRANSACTION = 'eth_sendTransaction';
var METHOD_GET_TRANSACTION_RECEIPT = 'eth_getTransactionReceipt';
var REVERT_MESSAGE_ID = '0x08c379a0'; // first 4byte of keccak256('Error(string)').

/**
 * This class is parser and manager of information that is error RPC response.
 */

var ErrorResponseCapture = function () {
  function ErrorResponseCapture(req) {
    (0, _classCallCheck3.default)(this, ErrorResponseCapture);

    this.rpcMethod = req.method;
    this.response = {};
  }

  /**
   * check the RPC method is target.
   * @return {boolean}
   */


  (0, _createClass3.default)(ErrorResponseCapture, [{
    key: 'isTargetMethod',
    value: function isTargetMethod() {
      return this.rpcMethod === METHOD_SEND_TRANSACTION || this.rpcMethod === METHOD_CALL || this.rpcMethod === METHOD_GET_TRANSACTION_RECEIPT;
    }
  }, {
    key: 'isEthCallMethod',
    value: function isEthCallMethod() {
      return this.rpcMethod === METHOD_CALL;
    }
  }, {
    key: 'isGetTransactionReceipt',
    value: function isGetTransactionReceipt() {
      return this.rpcMethod === METHOD_GET_TRANSACTION_RECEIPT;
    }
  }, {
    key: 'parseResponse',
    value: function parseResponse(result) {
      this.response = result;
      this._analyzeRPCMethod();
      this._analyzeResponseBody();
      this._classifyErrorType();
    }

    /**
     * analayze target node and is error from RPC method.
     * @private
     */

  }, {
    key: '_analyzeRPCMethod',
    value: function _analyzeRPCMethod() {
      this.isGanacheError = this.rpcMethod === METHOD_CALL || this.rpcMethod === METHOD_SEND_TRANSACTION;

      this.isGethError = this.rpcMethod === METHOD_CALL || this.rpcMethod === METHOD_GET_TRANSACTION_RECEIPT;
    }

    /**
     * analyze is error from response data structure.
     * @private
     */

  }, {
    key: '_analyzeResponseBody',
    value: function _analyzeResponseBody() {
      if (this.isGanacheError) {
        this.isGanacheError = this.response.error !== undefined && this.response.error.message !== undefined;
      }
      if (this.isGethError) {
        if (this.rpcMethod === METHOD_CALL) {
          this.isGethError = this.response.result !== undefined && this.response.result.startsWith(REVERT_MESSAGE_ID);
        }
        if (this.rpcMethod === METHOD_GET_TRANSACTION_RECEIPT) {
          this.isGethError = this.response.result !== undefined && this.response.result.status === '0x0';
        }
      }
    }

    /**
     * classify error type, revert or invalid.
     * @private
     */

  }, {
    key: '_classifyErrorType',
    value: function _classifyErrorType() {
      this.isReverting = false;
      this.isInvaliding = false;
      if (this.isGanacheError) {
        this.isReverting = this.response.error.message.endsWith(': revert');
        this.isInvaliding = this.response.error.message.endsWith(': invalid opcode');
      }
    }
  }]);
  return ErrorResponseCapture;
}();

exports.default = ErrorResponseCapture;
module.exports = exports['default'];