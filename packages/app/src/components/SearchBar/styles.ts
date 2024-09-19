import { customTheme } from '../../styles';
import { styled } from '@mui/material';

export const SearchBarWrapper = styled('div')`
	border-radius: 10px;
	border: 2px solid ${customTheme.grey};
	width: 100%;
	height: 50px;

	display: flex;
	flex-direction: row;
	align-items: center;

	background-color: ${customTheme.grey};
	transition: background-color 0.1s;
	padding: 0;
	margin: 0;

	&:hover {
		background-color: ${customTheme.grey2};
		transition: background-color 0.1s;
	}
`;

export const SearchIconWrapper = styled('div')`
	padding: 5px;
	position: relative;
	pointer-events: none;
	display: flex;
	align-items: center;
	justify-content: center;
	color: ${customTheme.dark};
	border-top-left-radius: 10px;
	border-bottom-left-radius: 10px;
	background: transparent;
`;

export const SearchInput = styled('input')`
	font-family: ${customTheme.font.light};
	font-weight: 700;
	font-size: 24px;
	width: 100%;
	background: transparent;
	border-radius: 10px;
	border: none;
	color: ${customTheme.dark};
	height: 100%;
`;

export const SearchList = styled('ul')(({ theme }) => ({
	marginTop: 5,
	padding: 0,
	backgroundColor: customTheme.grey,
	borderRadius: '10px',
	overflow: 'auto',
	verticalAlign: 'center',
	zIndex: 1,
	position: 'absolute',
	width: '25%',
}));
