var URL = require('url');
var _ = require('underscore');
var S = require('string');
var GenerateSchema = require('generate-schema');
var SwaggerParser = require('swagger-parser');

var defaultDescription = '';

function HarToSwagger () { };

HarToSwagger.generateAsync = function (harContent, info, options, callback) {
  if (typeof(info) === 'function' && options === undefined && callback === undefined) {
    callback = info;
    info = {};
    options = {};
  }

  try {
    var _options = _.defaults(options || { }, {
      guessDataType: true
    });

    var swagger = this.initialize(info);
    var har = JSON.parse(harContent);

    this.setHost(swagger, har);

    _.each(har.log.entries, function (entry, index, entries) {
      this.addPath(swagger, entry, _options);
    }, this);

    SwaggerParser.validate(swagger, {
      $refs: {
        internal: false
      }
    }, function (err, api) {
      callback(null, {
        swagger: swagger,
        validationErrors: err
      });
    }, this);
  } catch (err) {
    callback(err, null);
  }
};

HarToSwagger.initialize = function(info) {
  var _info = _.defaults(info || { }, {
    version: '<your API version>',
    title: '<your API title>',
    description: '<your API description>',
    termsOfService: '<your API terms of service>'
  });

  var swagger = {
    swagger: '2.0',
    info: _info,
    host: null,
    paths: {},
    definitions: {}
  };

  return swagger;
};

HarToSwagger.setHost = function (swagger, har) {
  if (har.log && har.log.entries && har.log.entries.length > 0) {
    swagger.host = _.find(har.log.entries[0].request.headers, function (header) {
      return header.name == 'Host';
    }).value;
  } else {
    // error
  }
};

HarToSwagger.addPath = function (swagger, harLogEntry, options) {
  var url = URL.parse(harLogEntry.request.url, true);
  
  if (!(url.pathname in swagger.paths)) {
    swagger.paths[url.pathname] = {};
  }

  this.addOperation(swagger, harLogEntry, options);
};

HarToSwagger.addOperation = function (swagger, harLogEntry, options) {
  var url = URL.parse(harLogEntry.request.url, true);

  var httpMethod = harLogEntry.request.method.toLowerCase();
  if (!(httpMethod in swagger.paths[url.pathname])) {   // if the HTTP method isn't there, add it.
    swagger.paths[url.pathname][httpMethod] = {
      description: this._getHeaderValue(harLogEntry.request.headers, 'x-swagger-description'),
      operationId: this._getHeaderValue(harLogEntry.request.headers, 'x-swagger-operationId'),
      parameters: [],
      responses: {}
    };
  } else {    // if the HTTP method is there already, try to merge.
    swagger.paths[url.pathname][httpMethod].description = swagger.paths[url.pathname][httpMethod].description
      || this._getHeaderValue(harLogEntry.request.headers, 'x-swagger-description')
    swagger.paths[url.pathname][httpMethod].operationId = swagger.paths[url.pathname][httpMethod].operationId
      || this._getHeaderValue(harLogEntry.request.headers, 'x-swagger-operationId')
  }

  var operation = swagger.paths[url.pathname][httpMethod];

  this.addParameters(operation, swagger, harLogEntry, options);
  this.addResponse(operation, swagger, harLogEntry, options);
};

HarToSwagger.addParameters = function (swaggerOperation, swagger, harLogEntry, options) {
  this.addParameterFromQuery(swaggerOperation, swagger, harLogEntry, options);
  this.addParameterFromPath(swaggerOperation, swagger, harLogEntry, options);
  this.addParameterFromBody(swaggerOperation, swagger, harLogEntry, options);  
};

HarToSwagger.addParameterFromQuery = function(swaggerOperation, swagger, harLogEntry, options) {
  var url = URL.parse(harLogEntry.request.url, true);

  if (url.query) {
    _.each(url.query, function (parameterValue, parameterName, parameters) {
      var parameter = {
        name: parameterName,
        'in': 'query',
        description: defaultDescription,
        required: true,
        type: 'string'
      };

      if (options.guessDataType) {
        parameter = _.extend(parameter, this._guessDataType(parameterValue));
      }

      swaggerOperation.parameters.push(parameter);
    }, this);
  }
};

HarToSwagger.addParameterFromPath = function(swaggerOperation, swagger, harLogEntry, options) {
  // add parameters from path based on x-swagger-routing-template header
  var routingTemplate = _.find(harLogEntry.request.headers, function (header) {
    return header.name == 'x-swagger-routing-template';
  });
  if (routingTemplate) {
    var matches = routingTemplate.value.match(/{[^/]+}/g);
    if (matches) {
      _.each(matches, function (match, index, matches) {
        var parameter = {
          name: match.substr(1, match.length - 2),
          'in': 'path',
          description: defaultDescription,
          required: true,
          type: 'string'
        };

        if (options.guessDataType) {
          parameter = _.extend(parameter, this._guessDataType(parameterValue));
        }

        swaggerOperation.parameters.push(parameter);
      }, this);
    }
  }
};

HarToSwagger.addParameterFromBody = function(swaggerOperation, swagger, harLogEntry, options) {
  if (harLogEntry.request.bodySize > 0 && harLogEntry.request.postData != undefined) {
    var requestBodyJson = null;
    var requestBodySchema = null;

    if (S(harLogEntry.request.postData.mimeType).include('application/json')) {   // if it's JSON
      requestBodyJson = JSON.parse(harLogEntry.request.postData.text);
    } else { // if it's not
      requestBodyJson = { };
      _.each(harLogEntry.request.postData.params, function (param, index, params) {
        requestBodyJson[param.name] = param.value;
      });
    }
    
    // generate a defintion object if x-swagger-body-type is provided. otherwise, generate a JSON schema inline.
    var bodyType = this._getHeaderValue(harLogEntry.request.headers, 'x-swagger-body-type');
    if (bodyType) {
      this.addDefinition(requestBodyJson, bodyType, swagger, harLogEntry, options);
      requestBodySchema = {
        '$ref': '#/definitions/' + bodyType
      };
    } else {
      requestBodySchema = GenerateSchema.json(requestBodyJson, {
        $schema: false
      });
    }

    swaggerOperation.parameters.push({
      name: 'body',
      'in': 'body',
      description: defaultDescription,
      required: true,
      schema: requestBodySchema
    });
  }
};

HarToSwagger.addResponse = function (swaggerOperation, swagger, harLogEntry, options) {
  var responseBodySchema = null;

  if (harLogEntry.response.bodySize > 0 && harLogEntry.response.content !== undefined) {
    var responseBodyJson = JSON.parse(harLogEntry.response.content.text);

    // generate a defintion object if x-swagger-body-type is provided. otherwise, generate a JSON schema inline.
    var bodyType = this._getHeaderValue(harLogEntry.response.headers, 'x-swagger-body-type');
    if (bodyType) {
      this.addDefinition(responseBodyJson, bodyType, swagger, harLogEntry, options);
      responseBodySchema = {
        '$ref': '#/definitions/' + bodyType
      };
    }
    else {
      responseBodySchema = GenerateSchema.json(responseBodyJson);
    }

    swaggerOperation.responses[harLogEntry.response.status.toString()] = {
      description: defaultDescription,
      schema: responseBodySchema
    };
  } else {
    swaggerOperation.responses[harLogEntry.response.status.toString()] = {
      description: defaultDescription
    };
  }
};

HarToSwagger.addDefinition = function (jsonObject, jsonType, swagger, harLogEntry, options) {
  var jsonSchema = GenerateSchema.json(jsonObject);
  
  if (_.has(swagger.definitions, jsonType)) {
    // merge with existing definition
    jsonSchema = _.extend(jsonSchema, swagger.definitions[jsonType])
  }

  swagger.definitions[jsonType] = jsonSchema;
};

HarToSwagger._guessDataType = function (value) {
  var result = {
    type: 'string'
  };

  if (!isNaN(value)) {
    if (S(value).include('.')) {    // this is a float or double
      result.type = 'number';
    }
    else {                          // this is an integer
      result.type = 'integer'
    }
  } else if (value.toLowerCase() == 'true' || value.toLowerCase() == 'false') {  // this is a boolean
    result.type = 'boolean';
  } else if (!isNaN(Date.parse(value))) {
    if (S(value).include(':')) {    // this is a date-time
       result.type = 'string';
       result.formt = 'date-time';
    } else {                        // this is a date
      result.type = 'string';
      result.formt = 'date';
    }
  } else {
    // cannot guess
  }

  return result;
}

HarToSwagger._getHeaderValue = function (headers, name) {
  var header = _.find(headers, function (header, index, headers) {
    return header.name == name;
  });

  if (header) {
    return header.value;
  } else {
    return null;
  }
};

module.exports = HarToSwagger;