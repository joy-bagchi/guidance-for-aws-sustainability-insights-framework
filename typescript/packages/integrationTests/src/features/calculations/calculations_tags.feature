@setup_calculations @calculations
Feature:

  	This feature tests the tagging of resources, therefore only focuses on testing responses and attributes specific to it.

	Scenario: Setup users
		Given group /calculationsTagTests exists
		And group /calculationsTagTests/a exists
		And group /calculationsTagTests/a has user calculationsTagTests_a_admin@amazon.com with role admin and password p@ssword1
		And group /calculationsTagTests/a has user calculationsTagTests_a_reader@amazon.com with role reader and password p@ssword1
		And group /calculationsTagTests/a/a exists
		And group /calculationsTagTests/a/a/a exists
		And group /calculationsTagTests/a/a/a/a exists
		And group /calculationsTagTests/a/a/a/a has user calculationsTagTests_a_a_a_a_reader@amazon.com with role reader and password p@ssword1
		And group /calculationsTagTests/b exists
		And group /calculationsTagTests/b has user calculationsTagTests_b_admin@amazon.com with role admin and password p@ssword1

	Scenario: Setup: Admin can create new resource (1) with tags

		New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarchical tag 'type' of 'Material/Metal/Steel'.

		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculation_1","summary":"Does nothing","formula":":one","parameters":[{"index":0,"key":"one","label":"one","description":"lone","type":"number"}],"outputs":[{"name":"one","description":"one.","type":"number"}],"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"}}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And I store the value of body path $.id as calculation_1_id in global scope

	Scenario: Setup: Admin can create new resource (2) with tags

		New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarchical tag 'type' of 'Material/Metal/Iron'.

		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculation_2","summary":"Does nothing","formula":":one","parameters":[{"index":0,"key":"one","label":"one","description":"lone","type":"number"}],"outputs":[{"name":"one","description":"one.","type":"number"}],"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Iron"}}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Iron
		And I store the value of body path $.id as calculation_2_id in global scope

	Scenario: Setup: Admin can create new resource (3) with tags

		New resource is created with a tag 'datasource' of 'Green Button Alliance' and a hierarchical tag 'type' of 'Material/Metal/Iron'.

		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculation_3","summary":"Does nothing","formula":":one","parameters":[{"index":0,"key":"one","label":"one","description":"lone","type":"number"}],"outputs":[{"name":"one","description":"one.","type":"number"}],"tags":{"datasource":"Green Button Alliance","type":"Material/Metal/Iron"}}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be Green Button Alliance
		And response body path $.tags.type should be Material/Metal/Iron
		And I store the value of body path $.id as calculation_3_id in global scope

	Scenario: Setup: Admin can create new resource (4) with tags

		New resource is created with a tag 'datasource' of 'Green Button Alliance' and a hierarchical tag 'type' of 'Material/Plastic/ABS'.

		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculation_4","summary":"Does nothing","formula":":one","parameters":[{"index":0,"key":"one","label":"one","description":"lone","type":"number"}],"outputs":[{"name":"one","description":"one.","type":"number"}],"tags":{"datasource":"Green Button Alliance","type":"Material/Plastic/ABS"}}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be Green Button Alliance
		And response body path $.tags.type should be Material/Plastic/ABS
		And I store the value of body path $.id as calculation_4_id in global scope

	Scenario: Setup: Admin can create new resource (5) with tags

		New resource is created with a tag 'datasource' of 'GHG Protocol' and a hierarchical tag 'type' of 'Material/Metal/Steel'
		but associated with group '/calculationsTagTests/b' therefore should not be returned in any results in the scenario.

		Given I authenticate using email calculationsTagTests_b_admin@amazon.com and password p@ssword1
		And I set body to {"name":"calculation_5","summary":"Does nothing","formula":":one","parameters":[{"index":0,"key":"one","label":"one","description":"lone","type":"number"}],"outputs":[{"name":"one","description":"one.","type":"number"}],"tags":{"datasource":"GHG Protocol","type":"Material/Metal/Steel"}}
		When I POST to /calculations
		Then response code should be 201
		And response body should contain id
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel
		And I store the value of body path $.id as calculation_5_id in global scope

	Scenario: Reader can retrieve resource 1 and has expected tags
		Given I authenticate using email calculationsTagTests_a_reader@amazon.com and password p@ssword1
		When I GET /calculations/`calculation_1_id`
		Then response code should be 200
		And response body path $.tags.datasource should be GHG Protocol
		And response body path $.tags.type should be Material/Metal/Steel

	Scenario: Reader can list resources and filter by tags (example 1)

		Filtering by group '/calculationsTagTests/a' and 'datasource' = 'GHG Protocol'.

		Given I authenticate using email calculationsTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter | value |
			| tags | datasource:GHG Protocol     |
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 2
		And response body path $.calculations[0].id should be `calculation_1_id`
		And response body path $.calculations[1].id should be `calculation_2_id`

	Scenario: Reader can list resources and filter by tags (example 2)

		Filtering by group '/calculationsTagTests/a' and 'datasource' = 'GHG Protocol' and 'type' = 'Material/Metal/Steel'.

		Given I authenticate using email calculationsTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter | value |
			| tags | datasource:GHG Protocol     |
			| tags | type:Material/Metal/Steel  |
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 1
		And response body path $.calculations[0].id should be `calculation_1_id`

	Scenario: Reader can list resources and filter by tags (example 3)

		Filtering by group '/calculationsTagTests/a' and 'type' = 'Material/Plastic'.

		Given I authenticate using email calculationsTagTests_a_reader@amazon.com and password p@ssword1
		And I set query parameters to
			| parameter | value |
			| tags | type:Material/Plastic     |
		When I GET /calculations
		Then response code should be 200
		And response body path $.calculations.length should be 1
		And response body path $.calculations[0].id should be `calculation_4_id`

	Scenario: Reader can list tag values for a given key (example 1)

		Filtering by group '/calculationsTagTests/a' and listing values for 'datasource' tag.

		Given I authenticate using email calculationsTagTests_a_reader@amazon.com and password p@ssword1
		When I GET /tags/datasource
		Then response code should be 200
		And response body path $.values.["ghg protocol"] should be GHG Protocol
		And response body path $.values.["green button alliance"] should be Green Button Alliance

	Scenario: Reader can list tag values for a given key (example 2)

		Filtering by group '/calculationsTagTests/b' and listing values for 'datasource' tag.

		Given I authenticate using email calculationsTagTests_b_admin@amazon.com and password p@ssword1
		When I GET /tags/datasource
		Then response code should be 200
		And response body path $.values.["ghg protocol"] should be GHG Protocol
		And response body should not contain values.["green button alliance"]

	Scenario: Reader can list tag values for a given key (example 3)

		Filtering by group '/calculationsTagTests/a' and listing values for 'type' tag.

		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type
		Then response code should be 200
		And response body path $.values.material should be Material

	Scenario: Reader can list tag values for a given key (example 4)

		Filtering by group '/calculationsTagTests/a' and listing values for 'type' tag and parent value 'Material'.

		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type?parentValue=material
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body path $.values.["material/plastic"] should be Plastic

	Scenario: Reader can list tag values for a given key (example 5)

		Filtering by group '/calculationsTagTests/a' and listing values for 'type' tag and parent value 'material/metal'.

		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		When I GET /tags/type?parentValue=material%2fmetal
		Then response code should be 200
		And response body path $.values.["material/metal/steel"] should be Steel

	Scenario: Reader of sub group can list tag values for a given key

		Filtering by group '/calculationsTagTests/a/a/a/a' and listing values for 'type' tag and parent value 'Material'.

		Given I authenticate using email calculationsTagTests_a_a_a_a_reader@amazon.com and password p@ssword1
		And I pause for 2000ms
		When I GET /tags/type?parentValue=material
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body path $.values.["material/plastic"] should be Plastic

	Scenario: Admin can update resource with tags

		Existing resource is updated so 'datasource' tag is removed and hierarchical tag 'type' changed from 'Material/Plastic/ABS' to 'Material/Metal/Iron'.

		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		And I set body to {"tags":{"datasource":null,"type":"Material/Metal/Iron"}}
		When I PATCH /calculations/`calculation_4_id`
		Then response code should be 200
		And response body should not contain tags.datasource
		And response body path $.tags.type should be Material/Metal/Iron

	Scenario: Reader of sub group listing tag values should see updated tags summarized

		Filtering by group '/calculationsTagTests/a/a/a/a' and listing values for 'type' tag and parent value 'Material'.

		Given I authenticate using email calculationsTagTests_a_a_a_a_reader@amazon.com and password p@ssword1
		And I pause for 2000ms
		When I GET /tags/type?parentValue=material
		Then response code should be 200
		And response body path $.values.["material/metal"] should be Metal
		And response body should not contain tags.["material/plastic"]

	Scenario: Teardown: Delete calculation `calculation_1_id`
		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /calculations/`calculation_1_id`
		Then response code should be 204
		When I GET /calculations/`calculation_1_id`
		Then response code should be 404

	Scenario: Teardown: Delete calculation `calculation_2_id`
		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /calculations/`calculation_2_id`
		Then response code should be 204
		When I GET /calculations/`calculation_2_id`
		Then response code should be 404

	Scenario: Teardown: Delete calculation `calculation_3_id`
		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /calculations/`calculation_3_id`
		Then response code should be 204
		When I GET /calculations/`calculation_3_id`
		Then response code should be 404

	Scenario: Teardown: Delete calculation `calculation_4_id`
		Given I authenticate using email calculationsTagTests_a_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /calculations/`calculation_4_id`
		Then response code should be 204
		When I GET /calculations/`calculation_4_id`
		Then response code should be 404

	Scenario: Teardown: Delete calculation `calculation_5_id`
		Given I authenticate using email calculationsTagTests_b_admin@amazon.com and password p@ssword1
		When I remove header Content-Type
		When I DELETE /calculations/`calculation_5_id`
		Then response code should be 204
		When I GET /calculations/`calculation_5_id`
		Then response code should be 404

	Scenario: Teardown: Revoke users
		Given group /calculationsTagTests/a has user calculationsTagTests_a_admin@amazon.com revoked
		And group /calculationsTagTests/a has user calculationsTagTests_a_reader@amazon.com revoked
		And group /calculationsTagTests/a/a/a/a has user calculationsTagTests_a_a_a_a_reader@amazon.com revoked
		And group /calculationsTagTests/b has user calculationsTagTests_b_admin@amazon.com revoked

	Scenario: Teardown: Delete groups
		Given group /calculationsTagTests/a/a/a/a has been removed
		And group /calculationsTagTests/a/a/a has been removed
		And group /calculationsTagTests/a/a has been removed
		And group /calculationsTagTests/a has been removed
		And group /calculationsTagTests/b has been removed
		And group /calculationsTagTests has been removed
