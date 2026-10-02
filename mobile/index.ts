import { registerRootComponent } from 'expo';

// registers the geofence background task before anything else, so it also
// exists when Android starts the app in the background for a geofence event
import './src/services/geofence';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
