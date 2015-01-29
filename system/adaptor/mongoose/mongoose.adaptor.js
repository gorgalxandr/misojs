/*
	WIP: Create a mongoose adaptor
*/

//	Use miso adaptor
//var adaptor = require('../adaptor.js');

//	--- BEGIN TEST CODE FOR ADAPTOR

/*
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/test');

var Cat = mongoose.model('Cat', { name: String });

var kitty = new Cat({ name: 'Zildjian' });
kitty.save(function (err) {
  if (err) {
  	console.log(err);
  }// ...
  console.log('meow');
});

*/

//	Test for now...
//module.exports = adaptor.create('mongoose', {
//


/*
	To create an adaptor, create a function that can receive a set of utilities, 
	and returns an object with action methods to expose to the api.

	The methods must use the following signature:

		function(cb, err, args)


	Where:

	* cb is a success callback
	* err is an error callback
	* args is an object with any parameters you might require

	This is because we automatically generate:

	* A RESTful API route for every action method
	* A consistent server/client api
	* The client API is a lightweight shim to use the API seamlessly

 */
module.exports = function(utils){
	return {
		save: function(cb, err, args){
			var Model = utils.getModel(args.type), model, validation;

			if(!Model) {
				return err("Model not found " + args.type);
			}

			model = new Model(args.model);
			validation = model.isValid? model.isValid(): true;

			if(validation === true) {
				//	Save the model here
				return cb("saved model!");
			} else {
				//	Send beack the validation errors
				return err(validation);
			}
		},
		findById: function(cb, err, args){
			console.log('findbyid', args);
			setTimeout(function(){
				cb("found by id: " + args.id);
			}, 200);
		},
		findByModel: function(cb, err, args){
			console.log('findbymodel', args.model, args.whatever);
			setTimeout(function(){
				cb("found model!");
			}, 300);
		}
	};
};

/*
var model = {id: 12};

module.exports.api.findById({type: 'user', id: 12}).then(function(result){
	console.log("CCCBBB", result);
});

module.exports.api.findByModel({model: model }).then(function(result, model){
	console.log("CCCBBB", arguments);
});
*/

//	Example usage in an mvc ?


