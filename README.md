# Shadow Projector

A browser-based tool that converts black-and-white images into 3D-printable anamorphic shadow projectors. Upload a silhouette, and the app generates a cone with precisely shaped cutouts. Place an LED above the printed cone, and it casts the original image as a shadow on the table below.

## How it works

The app performs an inverse raycast: for every point on the cone surface, it traces a ray from the LED through that point to the floor and checks which image pixel it hits. Black pixels become solid wall; white pixels become cutouts. The result is a cone that reconstructs the source image purely through projected light and shadow.

A marching-squares algorithm produces smooth contour boundaries on the cone wall, and an internal support cage keeps floating geometry printable.

## Getting started

```
npm install
npm run dev
```

Open the app, drop in a B&W image, and adjust sliders to taste. The 3D preview renders the shadow in real time. Click **Download STL** when ready to print.

## Controls

**Image:** Threshold slider to tune black/white cutoff. Invert checkbox to flip. Click the preview canvas to offset the projection center.

**Dimensions:** Bottom/top radius (cone taper), cylinder height, LED height (affects projection angle, not physical size), wall thickness, wrap angle, projection distance.

**Support cage:** Strut width/depth, radial segments (vertical struts), height segments (horizontal rings), cage rotation.

## Build

```
npm run build
npm run preview
```

## Stack

React, Three.js, React Three Fiber, Tailwind CSS, Vite, TypeScript. Fully client-side -- no server required.
