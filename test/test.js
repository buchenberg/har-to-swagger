var fs = require('fs');
var h2s = require('../index.js');

var harContent = fs.readFileSync(__dirname + '/sample.har', 'utf8');

var result = h2s.generate(harContent);

fs.writeFileSync(__dirname + '/swagger.json', JSON.stringify(result.swagger, null, 2));
fs.writeFileSync(__dirname + '/validation-result.json', JSON.stringify(result.validationResult, null, 2));