'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Web3TraceProvider = undefined;
exports.injectInTruffle = injectInTruffle;

var _web3TraceProvider = require('./web3-trace-provider');

var _web3TraceProvider2 = _interopRequireDefault(_web3TraceProvider);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function injectInTruffle(web3, artifacts) {
  if (artifacts.require._traceProvider) {
    return artifacts.require._traceProvider;
  }

  // create new trace provider
  var newProvider = new _web3TraceProvider2.default(web3);
  web3.setProvider(newProvider);

  // proxy artifacts
  var oldRequire = artifacts.require;
  artifacts.require = function (path) {
    var result = oldRequire(path);
    result.web3 = web3;
    result.setProvider(newProvider);
    return result;
  };
  artifacts.require._traceProvider = newProvider;
  return newProvider;
}

// export web3 trace provider
var Web3TraceProvider = exports.Web3TraceProvider = _web3TraceProvider2.default;