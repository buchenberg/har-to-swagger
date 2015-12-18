var fs = require('fs');
var _ = require('underscore');
var S = require('string');
var h2s = require('../index.js');

var harFiles = _.filter(fs.readdirSync(__dirname), function (file) {
	return S(file).endsWith('.har');
})

_.each(harFiles, function (file, index, files) {
	var sample = fs.readFileSync(__dirname + '/' + file, 'utf8');
  var fileNameWithoutExtension = S(file).strip('.har');
  h2s.generateAsync(sample, function (err, result) {
    fs.writeFileSync(__dirname + '/' + fileNameWithoutExtension + '-swagger.json', JSON.stringify(result.swagger, null, 2));
    fs.writeFileSync(__dirname + '/' + fileNameWithoutExtension + '-validation-result.json', JSON.stringify(result.validationErrors, null, 2));
  });
});
