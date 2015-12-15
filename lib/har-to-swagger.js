var URL = require('url');
var _ = require('underscore');
var GenerateSchema = require('generate-schema');

function HarToSwagger () { };

HarToSwagger.generate = function (harContent, info, options) {
  var swagger = this.initialize(info);
  var har = JSON.parse(harContent);

  this.setHost(swagger, har);

  _.each(har.log.entries, function (entry, index, entries) {
    this.addPath(swagger, entry);
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

HarToSwagger.addPath = function (swagger, harLogEntry) {
  var url = URL.parse(harLogEntry.request.url, true);
  
  if (!(url.pathname in swagger.paths)) {
    swagger.paths[url.pathname] = {};
  }

  this.addMethod(swagger, harLogEntry);
};

HarToSwagger.addMethod = function (swagger, harLogEntry) {
  var url = URL.parse(harLogEntry.request.url, true);
  
  swagger.paths[url.pathname][harLogEntry.request.method.toLowerCase()] = {
    description: "",
    operationId: "",
    parameters: [],
    responses: {}
  };
  var method = swagger.paths[url.pathname][harLogEntry.request.method.toLowerCase()];

  this.addParameters(method, swagger, harLogEntry);
  this.addResponse(method, swagger, harLogEntry);
}

HarToSwagger.addParameters = function (swaggerMethod, swagger, harLogEntry) {
  this.addParameterFromQuery(swaggerMethod, swagger, harLogEntry);
  this.addParameterFromPath(swaggerMethod, swagger, harLogEntry);
  this.addParameterFromBody(swaggerMethod, swagger, harLogEntry);  
};

HarToSwagger.addParameterFromQuery = function(swaggerMethod, swagger, harLogEntry) {
  var url = URL.parse(harLogEntry.request.url, true);

  if (url.query) {
    _.each(url.query, function (parameterValue, parameterName, parameters) {
      swaggerMethod.parameters.push({
        name: parameterName,
        "in": "query",
        description: "",
        required: true,
        type: "string"            // TODO: try to guess the type
      });
    })
  }
};

HarToSwagger.addParameterFromPath = function(swaggerMethod, swagger, harLogEntry) {
  // add parameters from path based on x-ms-routing-template header
  var routingTemplate = _.find(harLogEntry.request.headers, function (header) {
    return header.name == "x-ms-routing-template";
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
          type: "string"        // TODO: try to guess the type
        });
      });
    }
  }
};

HarToSwagger.addParameterFromBody = function(swaggerMethod, swagger, harLogEntry) {
  if (harLogEntry.request.bodySize > 0) {
    var requestBodyJson = JSON.parse(harLogEntry.request.postData.text);
    var requestBodySchema = null;

    // generate a defintion object if x-ms-body-type is provided. otherwise, generate a JSON schema inline.
    var bodyType = _.find(harLogEntry.request.headers, function (header) {
      return header.name == "x-ms-body-type";
    });
    if (bodyType) {
      // TODO: right now 2nd entry will overwrite the 1st. should do a union.
      swagger.definitions[bodyType.value] = GenerateSchema.json(requestBodyJson);
      requestBodySchema = {
        "$ref": "#/definitions/" + bodyType.value
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

HarToSwagger.addResponse = function (swaggerMethod, swagger, harLogEntry) {
  if (harLogEntry.response.bodySize > 0) {
    var responseBodyJson = JSON.parse(harLogEntry.response.content.text);
    var responseBodySchema = null;

    // generate a defintion object if x-ms-body-type is provided. otherwise, generate a JSON schema inline.
    var bodyType = _.find(harLogEntry.response.headers, function (header, index, headers) {
      return header.name == "x-ms-body-type";
    });
    if (bodyType) {
      // TODO: right now 2nd entry will overwrite the 1st. should do a union.
      swagger.definitions[bodyType.value] = GenerateSchema.json(responseBodyJson);
      responseBodySchema = {
        "$ref": "#/definitions/" + bodyType.value
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

module.exports = HarToSwagger;