const R = window.React;
export const Fragment = R.Fragment;
function make(spread) {
  return function (type, props, key) {
    const { children, ...rest } = props || {};
    if (key !== undefined) rest.key = key;
    if (children === undefined) return R.createElement(type, rest);
    if (spread && Array.isArray(children))
      return R.createElement(type, rest, ...children);
    return R.createElement(type, rest, children);
  };
}
export const jsx = make(false);
export const jsxs = make(true);
export const jsxDEV = jsx;
