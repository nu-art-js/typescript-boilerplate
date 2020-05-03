/*
 * Permissions management system, define access level for each of
 * your server apis, and restrict users by giving them access levels
 *
 * Copyright (C) 2020 Adam van der Kruk aka TacB0sS
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export const config = {
	HttpModule: {
		origin: "https://us-central1-thunderstorm-staging.cloudfunctions.net/api",
		timeout: 10000
	},
	frontend: {
		origin: "https://thunderstorm-staging.firebaseapp.com",
	},
	ExampleModule: {
		remoteUrl: "/v1/sample/endpoint-example"
	},
	PushPubSubModule: {
		config: {
			apiKey: "AIzaSyCoQjoQibuydMi1ejlpobfgHOI7WMf11P8",
			authDomain: "nu-art-thunderstorm.firebaseapp.com",
			projectId: "nu-art-thunderstorm",
			messagingSenderId: "992823653177",
			appId: "1:992823653177:web:e289e37f159c1b56de6ee8"
		},
		publicKeyBase64: 'BF0GqqEoe1UmqcU-dg3Dse_2ctkaq5uFpFuR6il1U9A3HkvYcL83I8yC_rX-G8mM8M0hnH5TqcSIsHScd4LTS28'
	},
	ForceUpgrade:{
		assertVersionUrl: "/v1/version/assert"
	},
	LocalizationModule: {
		defaultLocale: "en",
		locales: {
			"en": {
				label: "Language_English",
				icon: "languages/en",
			},
			"nl": {
				label: "Language_Dutch",
				icon: "languages/nl"
			}
		},
		languages: {
			"en": require(`./res/localization/en`),
			"nl": require(`./res/localization/nl`),
		}
	}
};
