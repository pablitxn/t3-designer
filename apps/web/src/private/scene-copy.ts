const en = {
  title: 'Your scene', hint: 'Arrange objects, then save a project revision. Changes stay in this project.',
  readonly: 'Read-only access', top: 'Floor plan', three: '3D view', reset: 'Reset camera', lowWalls: 'Low walls', context: 'Building context', labels: 'Room labels',
  objects: 'Placed objects', empty: 'No objects placed yet.', choose: 'Select an object to adjust its placement.', room: 'Room',
  x: 'X · right (m)', y: 'Y · height (m)', z: 'Z · down (m)', rotation: 'Rotation (°)', remove: 'Remove from scene',
  add: 'Place an object', addAction: 'Add to scene', addHint: 'Objects already available to this project. Adding an instance does not change the original model.',
  fallback: 'The 3D viewer needs WebGL 2. Object placement controls remain available.',
  modelUnavailable: 'Model unavailable', selected: 'Selected object', notice: 'Positions and geometry are approximate. This editor does not check collisions or structural feasibility.',
  controls: 'Drag to orbit · scroll to zoom · right-drag to pan', source: 'Saved solar study',
}
const es: typeof en = {
  title: 'Tu escena', hint: 'Acomodá los objetos y guardá una revisión. Los cambios quedan en este proyecto.',
  readonly: 'Acceso de solo lectura', top: 'Plano', three: 'Vista 3D', reset: 'Restablecer cámara', lowWalls: 'Muros bajos', context: 'Contexto del edificio', labels: 'Nombres de ambientes',
  objects: 'Objetos colocados', empty: 'Todavía no hay objetos colocados.', choose: 'Seleccioná un objeto para ajustar su posición.', room: 'Ambiente',
  x: 'X · derecha (m)', y: 'Y · altura (m)', z: 'Z · abajo (m)', rotation: 'Rotación (°)', remove: 'Quitar de la escena',
  add: 'Colocar un objeto', addAction: 'Añadir a la escena', addHint: 'Objetos disponibles para este proyecto. Una nueva instancia no cambia el modelo original.',
  fallback: 'El visor 3D necesita WebGL 2. Los controles de posición siguen disponibles.',
  modelUnavailable: 'Modelo no disponible', selected: 'Objeto seleccionado', notice: 'Las posiciones y la geometría son aproximadas. Este editor no comprueba colisiones ni viabilidad estructural.',
  controls: 'Arrastrá para girar · rueda para acercar · botón derecho para desplazar', source: 'Estudio solar guardado',
}
const fr: typeof en = {
  title: 'Votre scène', hint: 'Placez les objets, puis enregistrez une révision. Les modifications restent dans ce projet.',
  readonly: 'Accès en lecture seule', top: 'Plan', three: 'Vue 3D', reset: 'Réinitialiser la caméra', lowWalls: 'Murs bas', context: 'Contexte du bâtiment', labels: 'Noms des pièces',
  objects: 'Objets placés', empty: 'Aucun objet placé pour le moment.', choose: 'Sélectionnez un objet pour ajuster sa position.', room: 'Pièce',
  x: 'X · droite (m)', y: 'Y · hauteur (m)', z: 'Z · bas (m)', rotation: 'Rotation (°)', remove: 'Retirer de la scène',
  add: 'Placer un objet', addAction: 'Ajouter à la scène', addHint: 'Objets disponibles pour ce projet. Une nouvelle instance ne modifie pas le modèle original.',
  fallback: 'La vue 3D nécessite WebGL 2. Les réglages de position restent disponibles.',
  modelUnavailable: 'Modèle indisponible', selected: 'Objet sélectionné', notice: 'Positions et géométrie approximatives. Cet éditeur ne vérifie ni les collisions ni la faisabilité structurelle.',
  controls: 'Glisser pour tourner · molette pour zoomer · clic droit pour déplacer', source: 'Étude solaire enregistrée',
}
export const sceneCopy = { en, es, fr }
