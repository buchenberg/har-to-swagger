var fs = require('fs');
var h2s = require('../index.js');

var harContent = fs.readFileSync(__dirname + '/sample.har', 'utf8');

var swagger = h2s.generate(harContent);

console.log(swagger);