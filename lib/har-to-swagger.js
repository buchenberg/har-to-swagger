var URL = require('url');
var _ = require('underscore');
var S = require('string');
var GenerateSchema = require('generate-schema');

function HarToSwagger () { };

HarToSwagger.generate = function (harContent, info, options) {
  var _options = _.defaults((_.isUndefined(options) || _.isNull(options)) ? { } : options, {
    guessDataType: true
  });

  var swagger = this.initialize(info);
  var har = JSON.parse(harContent);

  this.setHost(swagger, har);

  _.each(har.log.entries, function (entry, index, entries) {
    this.addPath(swagger, entry, _options);
  }, this);

  return JSON.stringify(swagger, null, 2);
};

HarToSwagger.initialize = function(info) {
  var _info = _.defaults((_.isUndefined(info) || _.isNull(info)) ? { } : info, {
    version: "<your API version>",
    title: "<your API title>",
    description: "<your API description>",
    termOfService: null,
    contact: null,
    license: null
  });

  var swagger = {
    swagger: "2.0",
    info: {
      version: _info.version,
      title: _info.title,
      description: _info.description,
      termOfService: _info.termOfService,
      contact: _info.contact,
      license: _info.license
    },
    host: null,
    paths: {},
    definitions: {}
  };

  return swagger;
};

HarToSwagger.setHost = function (swagger, har) {
  if (har.log && har.log.entries && har.log.entries.length > 0) {
    swagger.host = _.find(har.log.entries[0].request.headers, function (header) {
      return header.name == "Host";
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

  this.addMethod(swagger, harLogEntry, options);
};

HarToSwagger.addMethod = function (swagger, harLogEntry, options) {
  var url = URL.parse(harLogEntry.request.url, true);

  swagger.paths[url.pathname][harLogEntry.request.method.toLowerCase()] = {
    description: this._getHeaderValue(harLogEntry.request.headers, "x-swagger-description")
      ? this._getHeaderValue(harLogEntry.request.headers, "x-swagger-description")
      : "<description of this operation>",
    operationId: this._getHeaderValue(harLogEntry.request.headers, "x-swagger-operationId")
      ? this._getHeaderValue(harLogEntry.request.headers, "x-swagger-operationId")
      : "<id of this operation>",
    parameters: [],
    responses: {}
  };
  var method = swagger.paths[url.pathname][harLogEntry.request.method.toLowerCase()];

  this.addParameters(method, swagger, harLogEntry, options);
  this.addResponse(method, swagger, harLogEntry, options);
}

HarToSwagger.addParameters = function (swaggerMethod, swagger, harLogEntry, options) {
  this.addParameterFromQuery(swaggerMethod, swagger, harLogEntry, options);
  this.addParameterFromPath(swaggerMethod, swagger, harLogEntry, options);
  this.addParameterFromBody(swaggerMethod, swagger, harLogEntry, options);  
};

HarToSwagger.addParameterFromQuery = function(swaggerMethod, swagger, harLogEntry, options) {
  var url = URL.parse(harLogEntry.request.url, true);

  if (url.query) {
    _.each(url.query, function (parameterValue, parameterName, parameters) {
      swaggerMethod.parameters.push({
        name: parameterName,
        "in": "query",
        description: "",
        required: true,
        type: options.guessDataType ? this._guessDataType(parameterValue) : "string"
      });
    }, this);
  }
};

HarToSwagger.addParameterFromPath = function(swaggerMethod, swagger, harLogEntry, options) {
  // add parameters from path based on x-swagger-routing-template header
  var routingTemplate = _.find(harLogEntry.request.headers, function (header) {
    return header.name == "x-swagger-routing-template";
  });
  if (routingTemplate) {
    var matches = routingTemplate.value.match(/{[^/]+}/g);
    if (matches) {
      _.each(matches, function (match, index, matches) {
        swaggerMethod.parameters.push({
          name: match.substr(1, match.length - 2),
          "in": "path",
          description: "",
          required: true,
          type: options.guessDataType ? this._guessDataType(parameterValue) : "string"
        });
      }, this);
    }
  }
};

HarToSwagger.addParameterFromBody = function(swaggerMethod, swagger, harLogEntry, options) {
  if (harLogEntry.request.bodySize > 0) {
    var requestBodyJson = JSON.parse(harLogEntry.request.postData.text);
    var requestBodySchema = null;

    // generate a defintion object if x-swagger-body-type is provided. otherwise, generate a JSON schema inline.
    var bodyType = this._getHeaderValue(harLogEntry.request.headers, "x-swagger-body-type");
    if (bodyType) {
      this.addDefinition(requestBodyJson, bodyType, swagger, harLogEntry, options);
      requestBodySchema = {
        "$ref": "#/definitions/" + bodyType
      }
    }
    else {
      requestBodySchema = GenerateSchema.json(requestBodyJson);
    }

    swaggerMethod.parameters.push({
      name: "body",
      "in": "body",
      description: "",
      required: true,
      schema: requestBodySchema
    });
  }
};

HarToSwagger.addResponse = function (swaggerMethod, swagger, harLogEntry, options) {
  if (harLogEntry.response.bodySize > 0) {
    var responseBodyJson = JSON.parse(harLogEntry.response.content.text);
    var responseBodySchema = null;

    // generate a defintion object if x-swagger-body-type is provided. otherwise, generate a JSON schema inline.
    var bodyType = this._getHeaderValue(harLogEntry.response.headers, "x-swagger-body-type");
    if (bodyType) {
      this.addDefinition(responseBodyJson, bodyType, swagger, harLogEntry, options);
      responseBodySchema = {
        "$ref": "#/definitions/" + bodyType
      }
    }
    else {
      responseBodySchema = GenerateSchema.json(responseBodyJson);
    }

    // TODO: right now 1 method only gets 1 response. should support multiple responses.
    swaggerMethod.responses[harLogEntry.response.status.toString()] = {
      description: "",
      schema: responseBodySchema
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
    type: "string"
  };

  if (!isNaN(value)) {
    if (S(value).include('.')) {    // this is a float or double
      result.type = "number";
    }
    else {                          // this is an integer
      result.type = "integer"
    }
  } else if (value.toLowerCase() == "true" || value.toLowerCase() == "false") {  // this is a boolean
    result.type = "boolean";
  } else if (!isNaN(Date.parse(value))) {
    if (S(value).include(':')) {    // this is a date-time
       result.type = "string";
       result.formt = "date-time";
    } else {                        // this is a date
      result.type = "string";
      result.formt = "date";
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
    return undefined;
  }
};

module.exports = HarToSwagger;