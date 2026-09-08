// Paint and layout properties used by the lyric renderer. Avoid serializing
// hundreds of unrelated CSS properties on every word, on every video frame.
export const snapshotStyles = `
box-sizing display position inset top right bottom left z-index
width height min-width min-height max-width max-height
padding-top padding-right padding-bottom padding-left
margin-top margin-right margin-bottom margin-left
border-top-width border-right-width border-bottom-width border-left-width
border-top-style border-right-style border-bottom-style border-left-style
border-top-color border-right-color border-bottom-color border-left-color
border-top-left-radius border-top-right-radius border-bottom-left-radius border-bottom-right-radius
background-color background-image background-position background-size background-repeat background-origin background-clip
font-family font-size font-weight font-style font-stretch font-variant font-kerning
font-feature-settings font-variation-settings font-optical-sizing font-synthesis
line-height letter-spacing word-spacing text-align text-indent text-transform text-decoration text-shadow
text-rendering -webkit-font-smoothing -webkit-text-stroke-width -webkit-text-stroke-color -webkit-text-fill-color
white-space word-break overflow-wrap hyphens direction writing-mode vertical-align tab-size
color opacity visibility transform transform-origin translate rotate scale
will-change filter box-shadow mix-blend-mode isolation overflow-x overflow-y overflow-clip-margin
contain content-visibility contain-intrinsic-size container-type backface-visibility perspective perspective-origin
flex-direction flex-wrap flex-grow flex-shrink flex-basis align-items align-content align-self justify-content order row-gap column-gap
mask-image mask-position mask-size mask-repeat mask-origin mask-clip mask-mode mask-composite
-webkit-mask-image -webkit-mask-position -webkit-mask-size -webkit-mask-repeat -webkit-mask-origin -webkit-mask-clip -webkit-mask-composite
clip-path content float clear list-style-type d
`
  .trim()
  .split(/\s+/);
